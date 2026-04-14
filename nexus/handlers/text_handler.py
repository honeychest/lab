import json
import logging
import time
from datetime import datetime, timedelta

import redis.asyncio as aioredis
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from chs import dlog
from config import settings
from services import ai_service, notion_service, grammar_service
from handlers.law_handler import handle_law_query, KEY_LAW_STATE

logger = logging.getLogger(__name__)

# Redis 클라이언트 (모듈 로드 시 1회 생성)
redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

# ─── Redis 키 상수 ────────────────────────────────────────────────────────────
# 현재 출제된 퀴즈 문제 정보 (단어/정답/단계/page_id/문제 텍스트)
KEY_QUIZ_SESSION = "nexus:quiz:session:{chat_id}"
# 현재 사용자 상태 — "quiz" (퀴즈 진행중) / "word" (단어질문 처리중)
KEY_QUIZ_STATE   = "nexus:quiz:state:{chat_id}"
# 오늘 남은 퀴즈 문제 수 (하루 20개 한도)
KEY_QUIZ_COUNT   = "nexus:quiz:count:{chat_id}"
# 설명 후 [등록] 버튼 대기 중인 단어 정보 (새 입력 시 덮어쓰기)
KEY_WORD_PENDING = "nexus:word:pending:{chat_id}"
# 퀴즈 일시정지 플래그 — 존재하면 일시정지 상태 (TTL 없음, 명시적 삭제)
KEY_QUIZ_PAUSE   = "nexus:quiz:pause:{chat_id}"
# 문법 오류 등록 대기 중인 오류 목록 (버튼 콜백에서 사용)
KEY_GRAMMAR_PENDING = "nexus:grammar:pending:{chat_id}"
# 다음 문제 선제 생성 데이터 (word/meaning_ko/stage/page_id/question/definition)
KEY_QUIZ_PREFETCH = "nexus:quiz:prefetch:{chat_id}"

DAILY_QUIZ_LIMIT = 20  # 하루 퀴즈 최대 출제 수


def _k(key: str, chat_id: int) -> str:
    """키 템플릿에 chat_id 삽입."""
    return key.format(chat_id=chat_id)


def _quiz_buttons() -> InlineKeyboardMarkup:
    dlog("퀴즈 버튼 생성 — 힌트/질문/실패/중지 4개 통일")
    dlog("반환값 — _send_next_quiz, quiz:back, quiz:resume에서 사용")
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("힌트", callback_data="quiz:hint"),
        InlineKeyboardButton("질문", callback_data="quiz:word_query"),
        InlineKeyboardButton("실패", callback_data="quiz:fail"),
        InlineKeyboardButton("중지", callback_data="quiz:pause"),
    ]])


def _stage_icon(stage: int) -> str:
    dlog("단계에 따라 퀴즈 아이콘 결정 — 3단계 이상 작문, 미만 퀴즈")
    dlog("반환값 — 퀴즈 문제 헤더에 표시")
    return '✏️ 작문' if stage >= 3 else '🧩'


def _seconds_until_midnight() -> int:
    """지금부터 오늘 자정까지 남은 초 (퀴즈 세션 TTL용)."""
    now = datetime.now()
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((midnight - now).total_seconds())


# ─── 메인 진입점 ──────────────────────────────────────────────────────────────
async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """텍스트 메시지 수신 시 상태에 따라 분기."""
    chat_id = update.effective_chat.id
    text = update.message.text.strip()

    dlog("law 상태 먼저 확인 — 한국어 법령명 입력 허용 위해 ASCII 체크 전 분기")
    dlog("KEY_LAW_STATE Redis 조회")
    law_state = await redis.get(_k(KEY_LAW_STATE, chat_id))
    dlog("law 상태이면 handle_law_query() 호출 후 return")
    if law_state == "law":
        await handle_law_query(update, chat_id, text)
        return

    # 입력값 검증 — 영문자가 없으면 단어 질문으로 처리 불가
    if not any(c.isascii() and c.isalpha() for c in text):
        await update.message.reply_text("영단어나 영문 문장을 입력해주세요.")
        return

    # 현재 상태 확인
    state  = await redis.get(_k(KEY_QUIZ_STATE, chat_id))
    paused = await redis.get(_k(KEY_QUIZ_PAUSE, chat_id))

    if state == "quiz" and not paused:
        # 퀴즈 진행 중 → 퀴즈 답변으로 처리
        await _handle_quiz_answer(update, chat_id, text)
    else:
        # 일시정지 중이거나 퀴즈 없음 → 단어 질문으로 처리
        await _handle_word_query(update, chat_id, text)


# ─── 단어 질문 처리 ───────────────────────────────────────────────────────────
async def _handle_word_query(update: Update, chat_id: int, text: str) -> None:
    """단어/문장 설명 후 등록 버튼 표시."""
    dlog("짧은 입력 여부 체크 — 3글자 이하면 올바른 단어 확인 질문")
    if len(text) <= 3:
        dlog("원문 입력을 KEY_WORD_PENDING에 short_word_confirm 필드로 임시 저장")
        await redis.set(
            _k(KEY_WORD_PENDING, chat_id),
            json.dumps({"short_word_confirm": text}),
        )
        dlog("올바른 단어인가요? 메시지 전송")
        dlog("✅ 맞아요(word:short_confirm) / ✖ 아니에요(word:cancel) 버튼 표시")
        buttons = [[
            InlineKeyboardButton("✅ 맞아요", callback_data="word:short_confirm"),
            InlineKeyboardButton("✖ 아니에요", callback_data="word:cancel"),
        ]]
        await update.message.reply_text(
            f"'{text}' — 올바른 단어인가요?",
            reply_markup=InlineKeyboardMarkup(buttons),
        )
        return

    loading = await update.message.reply_text("분석 중... ⏳")

    t0 = time.time()
    info = await ai_service.explain_word(text)
    t1 = time.time()
    logger.info(f"[word_query] explain_word 소요: {t1 - t0:.2f}s — 입력: {text!r}, 결과: {info.get('word')!r}")

    word = info["word"]
    transformed = word.lower() != text.lower()

    # 원어로 contains 검색 — 관련 기존 항목 전체 조회
    raw_conflicts = await notion_service.search_words_containing(text)
    t2 = time.time()
    logger.info(f"[word_query] search_words_containing 소요: {t2 - t1:.2f}s — 결과 {len(raw_conflicts)}개")

    await loading.delete()
    conflict_pages = []
    for page in raw_conflicts:
        parsed = notion_service.parse_word_page(page)
        if parsed:
            conflict_pages.append({
                "page_id": parsed["page_id"],
                "word": parsed["word"],
                "stage": parsed["stage"],
            })

    # 대기 중인 단어 정보 Redis에 저장
    await redis.set(
        _k(KEY_WORD_PENDING, chat_id),
        json.dumps({
            **info,
            "original_word": text,
            "existing_page_id": None,
            "conflict_pages": conflict_pages,
        }),
    )

    # 답변 메시지 구성
    msg = (
        f"{word}\n"
        f"뜻: {info['meaning_ko']}\n\n"
        f"📌 \"{info['example']}\""
    )

    if conflict_pages:
        # 충돌 항목 있음 — 설명 먼저 출력 후 첫 항목 삭제 여부 질문
        await update.message.reply_text(msg)
        first = conflict_pages[0]
        dlog("작업중단 버튼 추가")
        buttons = [[
            InlineKeyboardButton("🗑 삭제", callback_data="word:conflict_delete"),
            InlineKeyboardButton("🔒 유지", callback_data="word:conflict_keep"),
            InlineKeyboardButton("⏹ 작업중단", callback_data="word:conflict_stop"),
        ]]
        await update.message.reply_text(
            f"기존에 '{first['word']}' ({first['stage']}단계)이 있어요. 삭제할까요?",
            reply_markup=InlineKeyboardMarkup(buttons),
        )
    else:
        # 충돌 없음 — 설명 + 등록 버튼 한 메시지
        if transformed:
            buttons = [[
                InlineKeyboardButton("✅ 추천형태로 등록", callback_data="word:register"),
                InlineKeyboardButton("📝 원어로 등록", callback_data="word:register_original"),
                InlineKeyboardButton("✖ 취소", callback_data="word:cancel"),
            ]]
        else:
            buttons = [[
                InlineKeyboardButton("✅ 등록", callback_data="word:register"),
                InlineKeyboardButton("✖ 취소", callback_data="word:cancel"),
            ]]
        await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(buttons))


async def _show_next_conflict_or_register(query, pending: dict) -> None:
    """다음 충돌 항목 질문 또는 등록 버튼 표시."""
    conflict_pages = pending.get("conflict_pages", [])

    if conflict_pages:
        next_item = conflict_pages[0]
        dlog("작업중단 버튼 추가")
        buttons = [[
            InlineKeyboardButton("🗑 삭제", callback_data="word:conflict_delete"),
            InlineKeyboardButton("🔒 유지", callback_data="word:conflict_keep"),
            InlineKeyboardButton("⏹ 작업중단", callback_data="word:conflict_stop"),
        ]]
        await query.message.reply_text(
            f"기존에 '{next_item['word']}' ({next_item['stage']}단계)이 있어요. 삭제할까요?",
            reply_markup=InlineKeyboardMarkup(buttons),
        )
    else:
        word = pending["word"]
        transformed = word.lower() != pending.get("original_word", word).lower()
        if transformed:
            buttons = [[
                InlineKeyboardButton("✅ 추천형태로 등록", callback_data="word:register"),
                InlineKeyboardButton("📝 원어로 등록", callback_data="word:register_original"),
                InlineKeyboardButton("✖ 취소", callback_data="word:cancel"),
            ]]
        else:
            buttons = [[
                InlineKeyboardButton("✅ 등록", callback_data="word:register"),
                InlineKeyboardButton("✖ 취소", callback_data="word:cancel"),
            ]]
        await query.message.reply_text(
            f"처리 완료! '{word}'를 등록할까요?",
            reply_markup=InlineKeyboardMarkup(buttons),
        )


# ─── 퀴즈 답변 채점 ───────────────────────────────────────────────────────────
async def _handle_quiz_answer(update: Update, chat_id: int, text: str) -> None:
    """퀴즈 답변 채점 후 결과 전송 및 다음 문제 출제."""
    raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
    if not raw:
        await update.message.reply_text("진행 중인 퀴즈가 없어요.")
        return

    ttl      = _seconds_until_midnight()
    session  = json.loads(raw)
    word       = session["word"]       # 정답 단어
    meaning_ko = session["meaning_ko"] # 한국어 뜻
    stage      = session["stage"]      # 현재 단계 (1/2/3)
    page_id    = session["page_id"]    # Notion page_id (단계 업데이트용)
    dlog("question 추출 — grade_writing 채점 기준 한국어 문장으로 전달")
    question   = session.get("question", "")
    dlog("mode 세션에서 추출 — quiz 모드 정답 시 단계 상승 방지")
    mode = session.get("mode", "auto")

    dlog("작문 채점 분기 stage >= 3 — 3단계 이상 모두 적용")
    if stage >= 3:
        # 3단계 이상: 작문 채점
        # 1차 — 단어 포함 여부 코드로 확인 (AI 오판 방지)
        word_used = word.lower() in text.lower()

        if not word_used:
            # 단어 미사용 — AI로 맥락 확인
            dlog("grade_writing(word, meaning_ko, question, text) — 한국어 문장 전달")
            result = await ai_service.grade_writing(word, meaning_ko, question, text)
            if result["context_ok"]:
                # 의미는 맞지만 단어 미사용 → 다시 도전 (단계 유지)
                await update.message.reply_text(f"⚠️ 의미는 맞지만 '{word}'를 직접 사용해야 해요. 다시 도전!")
                return
            else:
                correct = False
                reply = f"❌ 오답. '{word}'를 사용한 문장을 만들어보세요. 1단계로 돌아갑니다."
        else:
            # 단어 사용함 — AI로 올바른 사용 여부 + 문법 오류 분석
            dlog("grade_writing(word, meaning_ko, question, text) — 한국어 문장 전달")
            result = await ai_service.grade_writing(word, meaning_ko, question, text)
            correct = result["used_correctly"]
            if correct:
                reply = "✅ 정답! 올바르게 사용했어요."
            else:
                reply = f"❌ 오답. '{word}'를 올바른 맥락으로 사용해야 해요. 1단계로 돌아갑니다."

        grammar_errors     = result.get("grammar_errors", [])
        collocation_errors = result.get("collocation_errors", [])

        # 문법 오류 메시지 구성
        if correct and (grammar_errors or collocation_errors):
            if grammar_errors:
                error_lines = "\n".join(f"[{e['type']}] {e['detail']}" for e in grammar_errors)
                reply += f"\n\n⚠️ 문법 오류:\n{error_lines}"
            if collocation_errors:
                colloc_lines = "\n".join(collocation_errors)
                reply += f"\n\n💡 연어 등록 추천:\n{colloc_lines}"

            # grammar 세션 Redis에 임시 저장
            await redis.set(
                _k(KEY_GRAMMAR_PENDING, chat_id),
                json.dumps({
                    "expression": word,
                    "wrong_sentence": text,
                    "grammar_errors": grammar_errors,
                    "collocation_errors": collocation_errors,
                }),
                ex=ttl,
            )

            # 버튼 구성 — 문법/연어 각각 있을 때만 버튼 표시
            keyboard = []
            dlog("오류별 개별 등록 버튼 — grammar:register:{index}")
            dlog("각 오류마다 한 행: [📝 [유형] 등록] 버튼")
            for i, err in enumerate(grammar_errors):
                keyboard.append([InlineKeyboardButton(f"📝 [{err['type']}] 등록", callback_data=f"grammar:register:{i}")])
            dlog("연어/넘어가기 버튼은 마지막 행")
            last_row = []
            if collocation_errors:
                last_row.append(InlineKeyboardButton("✅ 단어장 등록", callback_data="grammar:register_collocation"))
            last_row.append(InlineKeyboardButton("넘어가기", callback_data="grammar:skip"))
            keyboard.append(last_row)
            await update.message.reply_text(reply, reply_markup=InlineKeyboardMarkup(keyboard))
        else:
            await update.message.reply_text(reply)
    else:
        # 1/2단계: 단순 정답 비교
        correct = text.strip().lower() == word.lower()
        if correct:
            await update.message.reply_text("✅ 정답!")
        else:
            await update.message.reply_text(f"❌ 오답. 정답은 '{word}'예요. 1단계로 돌아갑니다.")

    # 단계 업데이트 — quiz 모드 정답 시 단계 상승 방지, 실패는 항상 업데이트
    dlog("quiz 모드 정답 시 단계 업데이트 생략 — 실패는 항상 업데이트")
    if not (mode == "quiz" and correct):
        await notion_service.update_word_stage(page_id, correct)

    # 다음 문제 출제 (방금 푼 단어 제외)
    await _send_next_quiz(update, chat_id, exclude_page_id=page_id)


# ─── 다음 문제 선제 생성 ─────────────────────────────────────────────────────
async def _prefetch_next_question(chat_id: int, mode: str, exclude_page_id: str | None) -> None:
    import random as _random
    try:
        ttl = _seconds_until_midnight()
        dlog("다음 문제 선제 생성 — mode, exclude_page_id 기반으로 다음 단어 선택")
        if mode == "quiz":
            dlog("mode quiz: get_all_words() 상위 100개 셔플, exclude_page_id 제외")
            words = await notion_service.get_all_words()
            if exclude_page_id:
                words = [w for w in words if w["id"] != exclude_page_id]
            if not words:
                return
            pool = words[:100]
            _random.shuffle(pool)
            page = pool[0]
        else:
            dlog("mode auto: get_words_due() 첫 번째 단어")
            words = await notion_service.get_words_due()
            if not words:
                return
            page = words[0]

        dlog("parse_word_page() 실패 시 조용히 종료 — fallback은 _send_next_quiz가 처리")
        parsed = notion_service.parse_word_page(page)
        if not parsed:
            return

        word       = parsed["word"]
        meaning_ko = parsed["meaning_ko"]
        stage      = parsed["stage"]
        page_id    = parsed["page_id"]

        dlog("generate_quiz_with_hint() 호출 — question, definition 동시 생성")
        question, definition = await ai_service.generate_quiz_with_hint(word, meaning_ko, stage)

        dlog("Redis KEY_QUIZ_PREFETCH 키에 저장 (TTL 자정)")
        await redis.set(
            _k(KEY_QUIZ_PREFETCH, chat_id),
            json.dumps({"word": word, "meaning_ko": meaning_ko, "stage": stage, "page_id": page_id, "question": question, "definition": definition, "mode": mode}),
            ex=ttl,
        )
    except Exception as e:
        logger.warning(f"[prefetch] 실패 — chat_id: {chat_id}, 오류: {e}")


# ─── 다음 퀴즈 문제 출제 ─────────────────────────────────────────────────────
async def _send_next_quiz(update: Update, chat_id: int, exclude_page_id: str | None = None) -> None:
    """다음 문제 출제. 세션의 mode에 따라 자동출제/전체퀴즈 구분."""
    import random
    ttl = _seconds_until_midnight()

    # 현재 세션에서 mode 확인 (auto=자동출제, quiz=/quiz 명령)
    raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
    mode = json.loads(raw).get("mode", "auto") if raw else "auto"

    # 카운트 차감 (auto만 한도 적용, quiz는 무제한)
    count_key = _k(KEY_QUIZ_COUNT, chat_id)
    if mode == "auto":
        remaining = await redis.decr(count_key)
        await redis.expire(count_key, ttl)
        if remaining <= 0:
            await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
            await redis.delete(_k(KEY_QUIZ_SESSION, chat_id))
            await update.effective_message.reply_text("🎉 오늘 퀴즈 완료! 수고했어요 💪")
            return

    import asyncio as _asyncio
    dlog("prefetch 키 확인 — 있으면 즉시 사용, 없으면 일반 생성으로 진행")
    prefetch_raw = await redis.getdel(_k(KEY_QUIZ_PREFETCH, chat_id))
    if prefetch_raw:
        dlog("prefetch 파싱 → 세션 저장 → 즉시 출제 → 다음 prefetch trigger 후 return")
        pf         = json.loads(prefetch_raw)
        p_word       = pf["word"]
        p_meaning_ko = pf["meaning_ko"]
        p_stage      = pf["stage"]
        p_page_id    = pf["page_id"]
        p_question   = pf["question"]
        p_definition = pf.get("definition", "")
        await redis.set(
            _k(KEY_QUIZ_SESSION, chat_id),
            json.dumps({"word": p_word, "meaning_ko": p_meaning_ko, "stage": p_stage, "page_id": p_page_id, "question": p_question, "definition": p_definition, "mode": mode}),
            ex=ttl,
        )
        await redis.set(_k(KEY_QUIZ_STATE, chat_id), "quiz", ex=ttl)
        p_progress = f"[{DAILY_QUIZ_LIMIT - remaining}/{DAILY_QUIZ_LIMIT}]" if mode == "auto" else "[🔄]"
        p_body = f"{p_meaning_ko}\n\n{p_question}" if p_stage == 1 else p_question
        await update.effective_message.reply_text(
            f"{p_progress} {_stage_icon(p_stage)} {p_stage}단계\n{p_body}",
            reply_markup=_quiz_buttons(),
        )
        _asyncio.create_task(_prefetch_next_question(chat_id, mode, p_page_id))
        return
    dlog("prefetch 없으면 아래 일반 흐름으로 진행")
    # mode에 따라 단어 조회
    if mode == "quiz":
        # /quiz — 전체 단어, 상위 100개 셔플, 방금 푼 단어 제외
        words = await notion_service.get_all_words()
        if exclude_page_id:
            words = [w for w in words if w["id"] != exclude_page_id]
        if not words:
            await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
            await update.effective_message.reply_text("단어장이 비어있어요!")
            return
        pool = words[:100]
        random.shuffle(pool)
        page = pool[0]
    else:
        # auto — 오늘 리뷰할 단어
        words = await notion_service.get_words_due()
        if not words:
            await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
            await update.effective_message.reply_text("오늘 복습할 단어가 없어요!")
            return
        page = words[0]

    parsed = notion_service.parse_word_page(page)
    if not parsed:
        # 비어있는 페이지 건너뜀 → 다음 문제로
        await _send_next_quiz(update, chat_id)
        return
    word       = parsed["word"]       # 정답 단어
    meaning_ko = parsed["meaning_ko"] # 한국어 뜻
    stage      = parsed["stage"]      # 현재 단계
    page_id    = parsed["page_id"]    # Notion page_id

    # 로딩 메시지 — AI 호출 전 표시
    loading = await update.effective_message.reply_text("다음 문제 출제 중... ⏳")
    question = await ai_service.generate_quiz(word, meaning_ko, stage)
    await loading.delete()

    # 퀴즈 세션 저장 (mode 유지, 일반 생성은 definition 없음)
    await redis.set(
        _k(KEY_QUIZ_SESSION, chat_id),
        json.dumps({"word": word, "meaning_ko": meaning_ko, "stage": stage, "page_id": page_id, "question": question, "mode": mode}),
        ex=ttl,
    )
    await redis.set(_k(KEY_QUIZ_STATE, chat_id), "quiz", ex=ttl)

    # 문제 출제
    # 진행 표시 — auto는 몇/20, quiz 모드는 🔄 무제한
    if mode == "auto":
        remaining = await redis.get(count_key)
        total_done = DAILY_QUIZ_LIMIT - int(remaining) if remaining else 0
        progress = f"[{total_done}/{DAILY_QUIZ_LIMIT}]"
    else:
        progress = "[🔄]"

    buttons = [
        [
            InlineKeyboardButton("힌트", callback_data="quiz:hint"),
            InlineKeyboardButton("질문", callback_data="quiz:word_query"),
            InlineKeyboardButton("실패", callback_data="quiz:fail"),
            InlineKeyboardButton("중지", callback_data="quiz:pause"),
        ],
    ]
    dlog("변경 _quiz_buttons() 호출")
    # 1단계는 한글 뜻을 문제 위에 함께 표시
    body = f"{meaning_ko}\n\n{question}" if stage == 1 else question
    await update.effective_message.reply_text(
        f"{progress} {_stage_icon(stage)} {stage}단계\n{body}",
        reply_markup=InlineKeyboardMarkup(buttons),
    )
    dlog("문제 표시 후 다음 문제 prefetch 백그라운드 trigger — asyncio.create_task")
    _asyncio.create_task(_prefetch_next_question(chat_id, mode, page_id))


# ─── 버튼 콜백 처리 ───────────────────────────────────────────────────────────
async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """인라인 버튼 클릭 처리."""
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    data    = query.data  # 버튼 콜백 데이터

    if data == "word:conflict_delete":
        raw = await redis.get(_k(KEY_WORD_PENDING, chat_id))
        if not raw:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        pending = json.loads(raw)
        conflict_pages = pending.get("conflict_pages", [])
        current = conflict_pages.pop(0)
        pending["conflict_pages"] = conflict_pages
        await redis.set(_k(KEY_WORD_PENDING, chat_id), json.dumps(pending))
        await notion_service.delete_page(current["page_id"])
        await query.edit_message_text(f"🗑 '{current['word']}' ({current['stage']}단계) 삭제됐어요.")
        await _show_next_conflict_or_register(query, pending)

    elif data == "word:conflict_keep":
        raw = await redis.get(_k(KEY_WORD_PENDING, chat_id))
        if not raw:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        pending = json.loads(raw)
        conflict_pages = pending.get("conflict_pages", [])
        current = conflict_pages.pop(0)
        pending["conflict_pages"] = conflict_pages
        await redis.set(_k(KEY_WORD_PENDING, chat_id), json.dumps(pending))
        await query.edit_message_text(f"🔒 '{current['word']}' ({current['stage']}단계) 유지했어요.")
        await _show_next_conflict_or_register(query, pending)

    elif data == "word:register":
        # 단어 신규 등록
        raw = await redis.get(_k(KEY_WORD_PENDING, chat_id))
        if not raw:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        info = json.loads(raw)
        await notion_service.add_word(info["word"], info["meaning_ko"])
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"✅ '{info['word']}' 저장됐어요. 내일 첫 퀴즈 나올게요!")

    elif data == "word:register_original":
        # 원어 그대로 등록
        raw = await redis.get(_k(KEY_WORD_PENDING, chat_id))
        if not raw:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        info = json.loads(raw)
        original_word = info.get("original_word", info["word"])
        await notion_service.add_word(original_word, info["meaning_ko"])
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"✅ '{original_word}' 저장됐어요. 내일 첫 퀴즈 나올게요!")

    elif data == "word:reregister":
        # 기존 단어 재등록 (1단계 초기화) — 원본 메시지 버튼만 제거
        raw = await redis.get(_k(KEY_WORD_PENDING, chat_id))
        if not raw:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        info = json.loads(raw)
        await notion_service.update_word_stage(info["existing_page_id"], correct=False)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"🔄 '{info['word']}' 1단계로 초기화됐어요!")

    elif data == "word:short_confirm":
        dlog("short_confirm 콜백 — 짧은 단어 등록 확인됨")
        dlog("KEY_WORD_PENDING에서 short_word_confirm(원문) 로드")
        raw = await redis.get(_k(KEY_WORD_PENDING, chat_id))
        if not raw:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        pending_data = json.loads(raw)
        text = pending_data.get("short_word_confirm", "")
        dlog("원문 없으면 만료 메시지 후 return")
        if not text:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        await query.edit_message_reply_markup(reply_markup=None)
        dlog("loading 메시지 전송")
        loading = await query.message.reply_text("분석 중... ⏳")
        dlog("ai_service.explain_word(text) 호출")
        t0 = time.time()
        info = await ai_service.explain_word(text)
        t1 = time.time()
        logger.info(f"[short_confirm] explain_word 소요: {t1 - t0:.2f}s — 입력: {text!r}, 결과: {info.get('word')!r}")
        word = info["word"]
        transformed = word.lower() != text.lower()
        dlog("search_words_containing(text) 호출")
        raw_conflicts = await notion_service.search_words_containing(text)
        t2 = time.time()
        logger.info(f"[short_confirm] search_words_containing 소요: {t2 - t1:.2f}s — 결과 {len(raw_conflicts)}개")
        dlog("loading 삭제")
        await loading.delete()
        dlog("conflict_pages 구성")
        conflict_pages = []
        for page in raw_conflicts:
            parsed = notion_service.parse_word_page(page)
            if parsed:
                conflict_pages.append({
                    "page_id": parsed["page_id"],
                    "word": parsed["word"],
                    "stage": parsed["stage"],
                })
        dlog("pending Redis 저장 — short_word_confirm 필드 제거 후 기존 pending 구조로")
        await redis.set(
            _k(KEY_WORD_PENDING, chat_id),
            json.dumps({
                **info,
                "original_word": text,
                "existing_page_id": None,
                "conflict_pages": conflict_pages,
            }),
        )
        dlog("설명 메시지 구성")
        msg = (
            f"{word}\n"
            f"뜻: {info['meaning_ko']}\n\n"
            f"📌 \"{info['example']}\""
        )
        dlog("conflict 있으면 첫 항목 질문, 없으면 등록 버튼 표시")
        if conflict_pages:
            await query.message.reply_text(msg)
            first = conflict_pages[0]
            buttons = [[
                InlineKeyboardButton("🗑 삭제", callback_data="word:conflict_delete"),
                InlineKeyboardButton("🔒 유지", callback_data="word:conflict_keep"),
                InlineKeyboardButton("⏹ 작업중단", callback_data="word:conflict_stop"),
            ]]
            await query.message.reply_text(
                f"기존에 '{first['word']}' ({first['stage']}단계)이 있어요. 삭제할까요?",
                reply_markup=InlineKeyboardMarkup(buttons),
            )
        else:
            if transformed:
                buttons = [[
                    InlineKeyboardButton("✅ 추천형태로 등록", callback_data="word:register"),
                    InlineKeyboardButton("📝 원어로 등록", callback_data="word:register_original"),
                    InlineKeyboardButton("✖ 취소", callback_data="word:cancel"),
                ]]
            else:
                buttons = [[
                    InlineKeyboardButton("✅ 등록", callback_data="word:register"),
                    InlineKeyboardButton("✖ 취소", callback_data="word:cancel"),
                ]]
            await query.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(buttons))

    elif data == "word:conflict_stop":
        dlog("conflict_stop 콜백 — 작업중단 요청")
        dlog("KEY_WORD_PENDING에서 pending 로드")
        raw = await redis.get(_k(KEY_WORD_PENDING, chat_id))
        if not raw:
            dlog("pending 없으면 만료 메시지 후 return")
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        pending = json.loads(raw)
        dlog("pending의 conflict_pages 전체 비우기")
        pending["conflict_pages"] = []
        dlog("비워진 pending Redis 저장")
        await redis.set(_k(KEY_WORD_PENDING, chat_id), json.dumps(pending))
        dlog("기존 메시지 버튼 제거")
        await query.edit_message_reply_markup(reply_markup=None)
        dlog("_show_next_conflict_or_register 호출 — 등록 버튼으로 이동")
        await _show_next_conflict_or_register(query, pending)

    elif data == "word:cancel":
        await query.edit_message_text("취소됐어요.")

    elif data == "quiz:hint":
        # 퀴즈 힌트 — 첫 글자 + 나머지 언더바
        raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
        if not raw:
            await query.answer("진행 중인 퀴즈가 없어요.", show_alert=True)
            return
        session = json.loads(raw)
        word       = session["word"]        # 정답 단어
        meaning_ko = session["meaning_ko"]  # 한국어 뜻
        hint = word[0] + "_" * (len(word) - 1)
        await query.answer()
        dlog("session에서 definition 읽기 — prefetch로 미리 생성된 경우 즉시 사용")
        definition = session.get("definition")
        dlog("definition 없으면 AI 호출 fallback — 첫 문제 또는 캐시 미스")
        if not definition:
            definition = await ai_service.get_word_definition(word)
        dlog("힌트 메시지에 글자힌트 + 한글뜻 + 영어 정의 함께 출력")
        await query.message.reply_text(f"💡 힌트: {hint}\n{meaning_ko}\n{definition}")

    elif data == "quiz:word_query":
        # 퀴즈 중 단어 질문 — 상태를 word로 변경
        await redis.set(_k(KEY_QUIZ_STATE, chat_id), "word")
        await query.edit_message_text(
            query.message.text + "\n\n🔤 어떤 단어가 궁금해요? 입력해주세요.",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("↩ 퀴즈로 돌아가기", callback_data="quiz:back")
            ]])
        )

    elif data == "quiz:back":
        # 퀴즈로 복귀 — 저장된 문제 다시 출력
        raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
        if not raw:
            await query.edit_message_text("진행 중인 퀴즈가 없어요.")
            return
        session = json.loads(raw)
        stage    = session["stage"]     # 현재 단계
        question = session["question"]  # 저장된 문제 텍스트
        await redis.set(_k(KEY_QUIZ_STATE, chat_id), "quiz")
        dlog("_quiz_buttons() 호출")
        await query.edit_message_text(
            f"↩ 퀴즈로 돌아왔어요!\n{_stage_icon(stage)} {stage}단계\n{question}",
            reply_markup=_quiz_buttons(),
        )

    elif data == "quiz:pause":
        # 퀴즈 일시정지 — pause 플래그 설정 후 scheduler에 10분 단발 job 등록
        await redis.set(_k(KEY_QUIZ_PAUSE, chat_id), "1")
        await query.edit_message_text("⏸ 퀴즈를 일시정지했어요. 10분 후 다시 알려드릴게요!")
        # scheduler 단발 job 등록 (text_handler → scheduler 순환참조 방지용 지연 import)
        from scheduler import schedule_quiz_resume
        await schedule_quiz_resume(chat_id)

    elif data == "quiz:resume":
        # 퀴즈 재개 — pause 플래그 삭제 후 현재 문제 다시 출제
        await redis.delete(_k(KEY_QUIZ_PAUSE, chat_id))
        raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
        if not raw:
            await query.edit_message_text("퀴즈 세션이 만료됐어요. 내일 다시 시작해요!")
            return
        session  = json.loads(raw)
        stage    = session["stage"]    # 현재 단계
        question = session["question"] # 저장된 문제 텍스트
        dlog("_quiz_buttons() 호출")
        await query.edit_message_text(
            f"▶ 이어서 풀어봐요!\n{_stage_icon(stage)} {stage}단계\n{question}",
            reply_markup=_quiz_buttons(),
        )

    elif data == "quiz:fail":
        # 실패 처리 — 정답 공개 후 1단계 리셋 + 다음 문제
        raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
        if not raw:
            await query.answer("진행 중인 퀴즈가 없어요.", show_alert=True)
            return
        session = json.loads(raw)
        word    = session["word"]     # 정답 단어
        page_id = session["page_id"]  # Notion page_id
        await query.answer()
        dlog("원본 문제 메시지 버튼 제거")
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"❌ 실패. 정답은 '{word}'예요. 1단계로 돌아갑니다.")
        await notion_service.update_word_stage(page_id, correct=False)
        await _send_next_quiz(update, chat_id, exclude_page_id=page_id)

    elif data == "quiz:end":
        # 오늘 퀴즈 종료
        await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
        await redis.delete(_k(KEY_QUIZ_SESSION, chat_id))
        await redis.delete(_k(KEY_QUIZ_PAUSE, chat_id))
        await query.edit_message_text("오늘은 여기까지! 내일 또 봐요 💪")

    elif data.startswith("grammar:register:"):
        dlog("grammar:register:{index} 핸들러 — 인덱스 파싱")
        idx = int(data.split(":")[-1])
        raw = await redis.get(_k(KEY_GRAMMAR_PENDING, chat_id))
        if not raw:
            await query.answer("⏰ 등록 정보가 만료됐어요.", show_alert=True)
            return
        dlog("pending에서 해당 index 오류 추출 후 save_grammar_error() 호출")
        info              = json.loads(raw)
        grammar_errors     = info.get("grammar_errors", [])
        collocation_errors = info.get("collocation_errors", [])
        if idx >= len(grammar_errors):
            await query.answer("이미 등록됐거나 오류를 찾을 수 없어요.", show_alert=True)
            return
        err = grammar_errors[idx]
        await grammar_service.save_grammar_error(
            error_type=err["type"],
            expression=info["expression"],
            wrong_sentence=info["wrong_sentence"],
            error_detail=err["detail"],
        )
        dlog("pending에서 해당 오류 제거 후 Redis 업데이트")
        grammar_errors.pop(idx)
        info["grammar_errors"] = grammar_errors
        if grammar_errors or collocation_errors:
            await redis.set(_k(KEY_GRAMMAR_PENDING, chat_id), json.dumps(info), ex=_seconds_until_midnight())
        else:
            await redis.delete(_k(KEY_GRAMMAR_PENDING, chat_id))
        dlog("남은 오류로 keyboard 재구성 후 메시지 edit — 등록된 버튼 제거")
        keyboard = []
        for i, e in enumerate(grammar_errors):
            keyboard.append([InlineKeyboardButton(f"📝 [{e['type']}] 등록", callback_data=f"grammar:register:{i}")])
        last_row = []
        if collocation_errors:
            last_row.append(InlineKeyboardButton("✅ 단어장 등록", callback_data="grammar:register_collocation"))
        last_row.append(InlineKeyboardButton("넘어가기", callback_data="grammar:skip"))
        keyboard.append(last_row)
        await query.answer("📝 등록됐어요!")
        await query.edit_message_reply_markup(reply_markup=InlineKeyboardMarkup(keyboard))

    elif data == "grammar:register_collocation":
        # 연어만 있을 때 단독 단어장 등록
        raw = await redis.get(_k(KEY_GRAMMAR_PENDING, chat_id))
        if not raw:
            await query.edit_message_text("⏰ 등록 정보가 만료됐어요.")
            return
        await query.edit_message_text("⏳ 등록 중...")
        info = json.loads(raw)
        collocation_errors = info.get("collocation_errors", [])
        saved = 0
        for expression in collocation_errors:
            existing = await notion_service.exists_word(expression)
            if not existing:
                word_info = await ai_service.explain_word(expression)
                await notion_service.add_word(word_info["word"] or expression, word_info["meaning_ko"])
                saved += 1
        await redis.delete(_k(KEY_GRAMMAR_PENDING, chat_id))
        await query.edit_message_text(f"✅ 연어 {saved}개 단어장에 등록됐어요!")

    elif data == "grammar:skip":
        # 문법 오류 넘어가기
        await query.edit_message_text("넘어갈게요!")
