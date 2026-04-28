import json
import logging
import time
from datetime import datetime, timedelta

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from chs import dlog
from redis_client import (  # 변경 redis_client 공통 모듈에서 import
    redis, _k, _seconds_until_midnight,
    KEY_QUIZ_SESSION, KEY_QUIZ_STATE, KEY_QUIZ_COUNT,
    KEY_WORD_PENDING, KEY_QUIZ_PAUSE, KEY_GRAMMAR_PENDING,
    KEY_QUIZ_PREFETCH, KEY_INBOX_PENDING, KEY_LAW_STATE,
)
from services import ai_service, notion_service, grammar_service
from handlers.law_handler import handle_law_query
from handlers.url_handler import handle_url

dlog("redis_client 공통 모듈에서 일괄 import")

logger = logging.getLogger(__name__)


# [AGENT]
# 자동 퀴즈(auto)는 KEY_QUIZ_COUNT를 아직 출제 예약 가능한 문제 수로 사용한다.
# 문제로 낼 단어가 확보된 뒤 _consume_auto_quiz_count()로 1 차감하고,
# 표시 문구는 _format_auto_quiz_progress()의 [남은 퀴즈 N개] 형식으로 통일한다.


def _quiz_buttons() -> InlineKeyboardMarkup:
    dlog("퀴즈 버튼 생성 — 힌트/질문/실패/중지 4개 통일")
    dlog("반환값 — _send_next_quiz, quiz:back, quiz:resume에서 사용")
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("힌트", callback_data="quiz:hint"),
        InlineKeyboardButton("질문", callback_data="quiz:word_query"),
        InlineKeyboardButton("실패", callback_data="quiz:fail"),
        InlineKeyboardButton("중지", callback_data="quiz:pause"),
    ]])


def _quiz_pause_buttons() -> InlineKeyboardMarkup:
    dlog("일시정지 상태 버튼 생성 — 힌트/질문/실패/재개 (중지 자리에 재개)")
    dlog("반환값 — quiz:pause 핸들러에서 버튼 토글 시 사용")
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("힌트", callback_data="quiz:hint"),
        InlineKeyboardButton("질문", callback_data="quiz:word_query"),
        InlineKeyboardButton("실패", callback_data="quiz:fail"),
        InlineKeyboardButton("재개", callback_data="quiz:resume"),
    ]])


def _stage_icon(stage: int) -> str:
    dlog("단계에 따라 퀴즈 아이콘 결정 — 3단계 이상 작문, 미만 퀴즈")
    dlog("반환값 — 퀴즈 문제 헤더에 표시")
    return '✏️ 작문' if stage >= 3 else '🧩'


async def _consume_auto_quiz_count(chat_id: int, ttl: int):
    dlog("자동 퀴즈 현재 남은 수 조회")
    count_key = _k(KEY_QUIZ_COUNT, chat_id)
    count_str = await redis.get(count_key)
    dlog("남은 수가 없거나 0 이하이면 출제 불가로 판단")
    if not count_str or int(count_str) <= 0:
        dlog("자동 퀴즈 출제 불가 반환")
        return None
    dlog("출제 가능하면 KEY_QUIZ_COUNT 1 차감")
    remaining = await redis.decr(count_key)
    dlog("차감 후 TTL을 자정까지 유지")
    await redis.expire(count_key, ttl)
    dlog("차감 후 남은 수 반환 - _send_next_quiz와 handle_quiz_start_callback에서 완료판정과 progress 표시 기준으로 사용")
    return remaining


def _format_auto_quiz_progress(remaining: int):
    dlog("자동 퀴즈 progress 입력 remaining 확인")
    dlog("remaining 값으로 [남은 퀴즈 N개] 문구 생성")
    progress = f"[남은 퀴즈 {remaining}개]"
    dlog("progress 문자열 반환 - 자동 퀴즈 문제 헤더에 사용")
    return progress


def _contains_hangul(text: str) -> bool:
    """한글 음절(가-힣) 포함 여부 판정."""
    return any('\uac00' <= c <= '\ud7af' for c in text)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """텍스트 메시지 수신 시 상태에 따라 분기."""
    chat_id = update.effective_chat.id
    text = update.message.text.strip()

    # 분기 1: law 상태 활성 확인
    law_state = await redis.get(_k(KEY_LAW_STATE, chat_id))
    if law_state == "law":
        await handle_law_query(update, chat_id, text)
        return

    # 분기 2: http 문자열 포함 여부 확인
    if "http" in text:
        await handle_url(update, context)
        return

    # 분기 3: / 시작 방어
    if text.startswith("/"):
        logger.warning(f"분기 3 도달 불가 (filters.COMMAND가 차단해야 함) - chat_id: {chat_id}, text: {text}")
        return

    # 분기 4: 퀴즈 상태 활성 && !pause
    quiz_state = await redis.get(_k(KEY_QUIZ_STATE, chat_id))
    quiz_pause = await redis.get(_k(KEY_QUIZ_PAUSE, chat_id))
    if quiz_state == "quiz" and not quiz_pause:
        await _handle_quiz_answer(update, chat_id, text)
        return

    # 분기 5: 한글 미포함 (순수 영문/숫자)
    if not _contains_hangul(text):
        await _handle_word_query(update, chat_id, text)
        return

    # 분기 6: 한글 포함
    if len(text) <= 3:
        await redis.set(_k(KEY_INBOX_PENDING, chat_id), json.dumps({"short_confirm": text}), ex=600)
        buttons = [[
            InlineKeyboardButton("맞아요", callback_data="inbox:short_confirm"),
            InlineKeyboardButton("아니에요", callback_data="inbox:short_cancel"),
        ]]
        await update.message.reply_text(
            f"'{text}' — 올바르게 입력되었나요?",
            reply_markup=InlineKeyboardMarkup(buttons),
        )
    else:
        await redis.set(_k(KEY_INBOX_PENDING, chat_id), json.dumps({"text": text}), ex=600)
        buttons = [[
            InlineKeyboardButton("할일", callback_data="inbox:kind:할일"),
            InlineKeyboardButton("아이디어", callback_data="inbox:kind:아이디어"),
            InlineKeyboardButton("취소", callback_data="inbox:kind:취소"),
        ]]
        await update.message.reply_text(
            "종류를 선택해주세요",
            reply_markup=InlineKeyboardMarkup(buttons),
        )


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


# ─── Levenshtein distance 계산 ────────────────────────────────────────────────
def _levenshtein(s1: str, s2: str) -> int:
    dlog("Levenshtein distance 계산 — s1, s2 소문자 정규화")
    s1, s2 = s1.lower(), s2.lower()
    dlog("dp 테이블 (len(s1)+1) x (len(s2)+1) 초기화")
    dp = [[0] * (len(s2) + 1) for _ in range(len(s1) + 1)]
    dlog("첫 행/열: 삽입/삭제 비용으로 채우기")
    for i in range(len(s1) + 1):
        dp[i][0] = i
    for j in range(len(s2) + 1):
        dp[0][j] = j
    dlog("dp[i][j] = min(삽입, 삭제, 교체) 로 채우기")
    for i in range(1, len(s1) + 1):
        for j in range(1, len(s2) + 1):
            cost = 0 if s1[i - 1] == s2[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    dlog("dp[len(s1)][len(s2)] 반환 — _handle_quiz_answer에서 오타 판단에 사용")
    return dp[len(s1)][len(s2)]


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
                dlog("대안표현 result에서 추출")
                alternatives = result.get("alternatives", [])
                dlog("대안표현 있으면 reply에 '\\n\\n💡 비슷한 표현: ...' 추가")
                if alternatives:
                    reply += "\n\n💡 비슷한 표현: " + " / ".join(alternatives)
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
            dlog("Levenshtein distance로 오타/완전오답 구분")
            distance = _levenshtein(text, word)
            dlog("세션에서 retry_count 추출 (없으면 0)")
            retry_count = session.get("retry_count", 0)
            dlog("distance ≤ 2 이고 retry_count == 0 이면 오타 판단 분기")
            if distance <= 2 and retry_count == 0:
                dlog("세션 retry_count=1 로 업데이트 후 Redis 저장")
                session["retry_count"] = 1
                await redis.set(_k(KEY_QUIZ_SESSION, chat_id), json.dumps(session), ex=ttl)
                dlog("오타 안내 메시지 전송 후 return — update_word_stage, _send_next_quiz 건너뜀")
                await update.message.reply_text("오타인 것 같아요! 다시 한번! 🔄")
                return
            dlog("그 외(distance > 2 또는 retry_count >= 1) 오답 처리")
            dlog("오답 메시지 전송 — 1단계로 돌아갑니다.")
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
            dlog("exclude_page_id 존재하면 해당 page_id를 words에서 제외")
            if exclude_page_id:
                words = [w for w in words if w["id"] != exclude_page_id]
            dlog("필터 후 words 비어있으면 return")
            if not words:
                return
            dlog("words[0] 첫 번째 단어를 page에 할당")
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
    count_key = _k(KEY_QUIZ_COUNT, chat_id)

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
        if mode == "auto":
            dlog("_consume_auto_quiz_count(chat_id, ttl) 호출")
            remaining = await _consume_auto_quiz_count(chat_id, ttl)
            if remaining is None:
                dlog("출제 불가이면 KEY_QUIZ_STATE와 KEY_QUIZ_SESSION 삭제")
                await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
                await redis.delete(_k(KEY_QUIZ_SESSION, chat_id))
                dlog("출제 불가이면 오늘 퀴즈 완료 메시지 전송 후 return")
                await update.effective_message.reply_text("🎉 오늘 퀴즈 완료! 수고했어요 💪")
                return
        await redis.set(
            _k(KEY_QUIZ_SESSION, chat_id),
            json.dumps({"word": p_word, "meaning_ko": p_meaning_ko, "stage": p_stage, "page_id": p_page_id, "question": p_question, "definition": p_definition, "mode": mode}),
            ex=ttl,
        )
        await redis.set(_k(KEY_QUIZ_STATE, chat_id), "quiz", ex=ttl)
        if mode == "auto":
            dlog("_format_auto_quiz_progress(remaining) 호출")
            p_progress = _format_auto_quiz_progress(remaining)
        else:
            p_progress = "[🔄]"
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
            dlog("KEY_QUIZ_COUNT 0 설정 → KEY_QUIZ_STATE 삭제 → return")
            dlog("다음 스케줄러에서 퀴즈 버튼 미노출 처리")
            await redis.set(count_key, 0, ex=ttl)
            await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
            await update.effective_message.reply_text("오늘 복습할 단어가 없어요!")
            return
        dlog("exclude_page_id 존재하면 해당 page_id를 words에서 제외")
        if exclude_page_id:
            words = [w for w in words if w["id"] != exclude_page_id]
        dlog("필터 후 words 비어있으면 상태 삭제 및 완료 메시지 후 return")
        if not words:
            dlog("KEY_QUIZ_COUNT 0 설정 → KEY_QUIZ_STATE 삭제 → return")
            dlog("다음 스케줄러에서 퀴즈 버튼 미노출 처리")
            await redis.set(count_key, 0, ex=ttl)
            await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
            await update.effective_message.reply_text("오늘 복습할 단어가 없어요!")
            return
        dlog("words[0] 첫 번째 단어를 page에 할당")
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
    if mode == "auto":
        dlog("_consume_auto_quiz_count(chat_id, ttl) 호출")
        remaining = await _consume_auto_quiz_count(chat_id, ttl)
        if remaining is None:
            dlog("출제 불가이면 KEY_QUIZ_STATE와 KEY_QUIZ_SESSION 삭제")
            await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
            await redis.delete(_k(KEY_QUIZ_SESSION, chat_id))
            dlog("출제 불가이면 오늘 퀴즈 완료 메시지 전송 후 return")
            await update.effective_message.reply_text("🎉 오늘 퀴즈 완료! 수고했어요 💪")
            return

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
        dlog("_format_auto_quiz_progress(remaining) 호출")
        progress = _format_auto_quiz_progress(remaining)
    else:
        progress = "[🔄]"

    dlog("_quiz_buttons() 호출")
    # 1단계는 한글 뜻을 문제 위에 함께 표시
    body = f"{meaning_ko}\n\n{question}" if stage == 1 else question
    await update.effective_message.reply_text(
        f"{progress} {_stage_icon(stage)} {stage}단계\n{body}",
        reply_markup=_quiz_buttons(),
    )
    dlog("reply_markup=_quiz_buttons() 직접 전달 — buttons 변수 제거")
    dlog("문제 표시 후 다음 문제 prefetch 백그라운드 trigger — asyncio.create_task")
    _asyncio.create_task(_prefetch_next_question(chat_id, mode, page_id))


# ─── 버튼 콜백 처리 ───────────────────────────────────────────────────────────
async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """인라인 버튼 클릭 처리."""
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    data    = query.data  # 버튼 콜백 데이터

    dlog("quiz:start 분기 — 스케줄 메시지 [시작] 콜백 처리 (REQ-B01)")
    if data == "quiz:start":
        dlog("quiz_handler.handle_quiz_start_callback 위임 — mode=auto, get_words_due 기반")
        from handlers.quiz_handler import handle_quiz_start_callback
        await handle_quiz_start_callback(update, context)
        return

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
        await query.message.reply_text(f"✅ '{info['word']}' 저장됐어요. 내일 첫 퀴즈 나올거에요!")

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
        await query.message.reply_text(f"✅ '{original_word}' 저장됐어요. 내일 첫 퀴즈 나올거에요!")

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
        dlog("word.split() 단어별 첫글자+언더바 생성 — 공백 포함 다단어 지원")
        dlog("각 단어 → 첫글자 + (len-1)개 언더바, 공백으로 join → carry out이면 c____ o__")
        hint = " ".join(w[0] + "_" * (len(w) - 1) for w in word.split())
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
        # 퀴즈 일시정지 — pause 플래그 설정
        dlog("KEY_QUIZ_PAUSE 설정")
        await redis.set(_k(KEY_QUIZ_PAUSE, chat_id), "1")
        dlog("_quiz_pause_buttons() 호출 — 중지→재개 버튼 교체")
        dlog("edit_message_reply_markup으로 버튼만 교체 — 문제 텍스트 유지")
        await query.edit_message_reply_markup(reply_markup=_quiz_pause_buttons())

    elif data == "quiz:resume":
        # 퀴즈 재개 — pause 플래그 삭제 후 버튼 복원
        dlog("KEY_QUIZ_PAUSE 삭제")
        await redis.delete(_k(KEY_QUIZ_PAUSE, chat_id))
        dlog("세션 만료 여부 확인 — 만료 시 query.answer() 팝업 안내 후 return")
        raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
        if not raw:
            await query.answer("퀴즈 세션이 만료됐어요. 내일 다시 시작해요!", show_alert=True)
            return
        dlog("_quiz_buttons() 호출 — 재개→중지 버튼 교체")
        dlog("edit_message_reply_markup으로 버튼만 교체 — 문제 텍스트 유지")
        await query.edit_message_reply_markup(reply_markup=_quiz_buttons())

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
