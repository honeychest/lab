import json
import logging
from datetime import datetime, timedelta

import redis.asyncio as aioredis
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from config import settings
from services import ai_service, notion_service, grammar_service

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

DAILY_QUIZ_LIMIT = 20  # 하루 퀴즈 최대 출제 수


def _k(key: str, chat_id: int) -> str:
    """키 템플릿에 chat_id 삽입."""
    return key.format(chat_id=chat_id)


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
    info = await ai_service.explain_word(text)
    word = info["word"]

    # Notion에서 기존 등록 여부 확인
    existing_page_id = await notion_service.exists_word(word)

    # 대기 중인 단어 정보 Redis에 저장 (버튼 콜백에서 사용)
    await redis.set(
        _k(KEY_WORD_PENDING, chat_id),
        json.dumps({**info, "existing_page_id": existing_page_id}),
    )

    # 답변 메시지 구성
    msg = (
        f"{word}\n"
        f"뜻: {info['meaning_ko']}\n\n"
        f"📌 \"{info['example']}\""
    )

    # 등록 여부에 따라 버튼 구성
    if existing_page_id:
        # 이미 등록된 단어 — 재등록(1단계 초기화) 또는 취소
        buttons = [[
            InlineKeyboardButton("🔄 재등록 (1단계 초기화)", callback_data="word:reregister"),
            InlineKeyboardButton("✖ 취소", callback_data="word:cancel"),
        ]]
    else:
        # 미등록 단어 — 등록 또는 취소
        buttons = [[
            InlineKeyboardButton("✅ 등록", callback_data="word:register"),
            InlineKeyboardButton("✖ 취소", callback_data="word:cancel"),
        ]]

    await update.message.reply_text(msg, reply_markup=InlineKeyboardMarkup(buttons))


# ─── 퀴즈 답변 채점 ───────────────────────────────────────────────────────────
async def _handle_quiz_answer(update: Update, chat_id: int, text: str) -> None:
    """퀴즈 답변 채점 후 결과 전송 및 다음 문제 출제."""
    raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
    if not raw:
        await update.message.reply_text("진행 중인 퀴즈가 없어요.")
        return

    ttl      = _seconds_until_midnight()
    session  = json.loads(raw)
    word     = session["word"]       # 정답 단어
    stage    = session["stage"]      # 현재 단계 (1/2/3)
    page_id  = session["page_id"]    # Notion page_id (단계 업데이트용)

    if stage == 3:
        # 3단계: 작문 채점
        # 1차 — 단어 포함 여부 코드로 확인 (AI 오판 방지)
        word_used = word.lower() in text.lower()

        if not word_used:
            # 단어 미사용 — AI로 맥락 확인
            result = await ai_service.grade_writing(word, text)
            if result["context_ok"]:
                # 의미는 맞지만 단어 미사용 → 다시 도전 (단계 유지)
                await update.message.reply_text(f"⚠️ 의미는 맞지만 '{word}'를 직접 사용해야 해요. 다시 도전!")
                return
            else:
                correct = False
                reply = f"❌ 오답. '{word}'를 사용한 문장을 만들어보세요. 1단계로 돌아갑니다."
        else:
            # 단어 사용함 — AI로 올바른 사용 여부 + 문법 오류 분석
            result = await ai_service.grade_writing(word, text)
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
            btn_row = []
            if grammar_errors:
                btn_row.append(InlineKeyboardButton("📝 문법 오류 등록", callback_data="grammar:register"))
            if collocation_errors:
                btn_row.append(InlineKeyboardButton("✅ 단어장 등록", callback_data="grammar:register_collocation"))
            btn_row.append(InlineKeyboardButton("넘어가기", callback_data="grammar:skip"))
            await update.message.reply_text(reply, reply_markup=InlineKeyboardMarkup([btn_row]))
        else:
            await update.message.reply_text(reply)
    else:
        # 1/2단계: 단순 정답 비교
        correct = text.strip().lower() == word.lower()
        if correct:
            await update.message.reply_text("✅ 정답!")
        else:
            await update.message.reply_text(f"❌ 오답. 정답은 '{word}'예요. 1단계로 돌아갑니다.")

    # 단계 업데이트
    await notion_service.update_word_stage(page_id, correct)

    # 다음 문제 출제 (방금 푼 단어 제외)
    await _send_next_quiz(update, chat_id, exclude_page_id=page_id)


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
            await update.message.reply_text("🎉 오늘 퀴즈 완료! 수고했어요 💪")
            return

    # mode에 따라 단어 조회
    if mode == "quiz":
        # /quiz — 전체 단어, 상위 100개 셔플, 방금 푼 단어 제외
        words = await notion_service.get_all_words()
        if exclude_page_id:
            words = [w for w in words if w["id"] != exclude_page_id]
        if not words:
            await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
            await update.message.reply_text("단어장이 비어있어요!")
            return
        pool = words[:100]
        random.shuffle(pool)
        page = pool[0]
    else:
        # auto — 오늘 리뷰할 단어
        words = await notion_service.get_words_due()
        if not words:
            await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
            await update.message.reply_text("오늘 복습할 단어가 없어요!")
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
    loading = await update.message.reply_text("다음 문제 출제 중... ⏳")
    question = await ai_service.generate_quiz(word, meaning_ko, stage)
    await loading.delete()

    # 퀴즈 세션 저장 (mode 유지)
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
            InlineKeyboardButton("💡 힌트", callback_data="quiz:hint"),
            InlineKeyboardButton("🔤 단어 질문", callback_data="quiz:word_query"),
            InlineKeyboardButton("⏸ 중지", callback_data="quiz:pause"),
        ],
    ]
    # 1단계는 한글 뜻을 문제 위에 함께 표시
    body = f"{meaning_ko}\n\n{question}" if stage == 1 else question
    await update.message.reply_text(
        f"{progress} {'✏️ 작문' if stage == 3 else '🧩'} {stage}단계\n{body}",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


# ─── 버튼 콜백 처리 ───────────────────────────────────────────────────────────
async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """인라인 버튼 클릭 처리."""
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    data    = query.data  # 버튼 콜백 데이터

    if data == "word:register":
        # 단어 신규 등록 — 원본 메시지 버튼만 제거, 결과는 새 메시지로
        raw = await redis.get(_k(KEY_WORD_PENDING, chat_id))
        if not raw:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
            return
        info = json.loads(raw)
        await notion_service.add_word(info["word"], info["meaning_ko"])
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"✅ '{info['word']}' 저장됐어요. 내일 첫 퀴즈 나올게요!")

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

    elif data == "word:cancel":
        # 등록 취소 — 버튼만 제거
        await query.edit_message_reply_markup(reply_markup=None)

    elif data == "quiz:hint":
        # 퀴즈 힌트 — 첫 글자 + 나머지 언더바
        raw = await redis.get(_k(KEY_QUIZ_SESSION, chat_id))
        if not raw:
            await query.answer("진행 중인 퀴즈가 없어요.", show_alert=True)
            return
        session = json.loads(raw)
        word = session["word"]  # 정답 단어
        hint = word[0] + "_" * (len(word) - 1)
        await query.answer()
        await query.message.reply_text(f"💡 힌트: {hint}")

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
        buttons = [
            [
                InlineKeyboardButton("💡 힌트", callback_data="quiz:hint"),
                InlineKeyboardButton("🔤 단어 질문", callback_data="quiz:word_query"),
                InlineKeyboardButton("⏸ 중지", callback_data="quiz:pause"),
            ],
        ]
        await query.edit_message_text(
            f"↩ 퀴즈로 돌아왔어요!\n{'✏️ 작문' if stage == 3 else '🧩'} {stage}단계\n{question}",
            reply_markup=InlineKeyboardMarkup(buttons),
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
        buttons = [
            [
                InlineKeyboardButton("💡 힌트", callback_data="quiz:hint"),
                InlineKeyboardButton("🔤 단어 질문", callback_data="quiz:word_query"),
                InlineKeyboardButton("⏸ 중지", callback_data="quiz:pause"),
            ],
        ]
        await query.edit_message_text(
            f"▶ 이어서 풀어봐요!\n{'✏️ 작문' if stage == 3 else '🧩'} {stage}단계\n{question}",
            reply_markup=InlineKeyboardMarkup(buttons),
        )

    elif data == "quiz:end":
        # 오늘 퀴즈 종료
        await redis.delete(_k(KEY_QUIZ_STATE, chat_id))
        await redis.delete(_k(KEY_QUIZ_SESSION, chat_id))
        await redis.delete(_k(KEY_QUIZ_PAUSE, chat_id))
        await query.edit_message_text("오늘은 여기까지! 내일 또 봐요 💪")

    elif data == "grammar:register":
        # 문법 오류 grammar DB 저장 + 연어 있으면 단어장에도 함께 등록
        raw = await redis.get(_k(KEY_GRAMMAR_PENDING, chat_id))
        if not raw:
            await query.edit_message_text("⏰ 등록 정보가 만료됐어요.")
            return
        await query.edit_message_text("⏳ 등록 중...")
        info = json.loads(raw)
        grammar_errors     = info.get("grammar_errors", [])
        collocation_errors = info.get("collocation_errors", [])

        grammar_saved = 0
        for err in grammar_errors:
            await grammar_service.save_grammar_error(
                error_type=err["type"],
                expression=info["expression"],
                wrong_sentence=info["wrong_sentence"],
                error_detail=err["detail"],
            )
            grammar_saved += 1

        colloc_saved = 0
        for expression in collocation_errors:
            existing = await notion_service.exists_word(expression)
            if not existing:
                word_info = await ai_service.explain_word(expression)
                await notion_service.add_word(word_info["word"] or expression, word_info["meaning_ko"])
                colloc_saved += 1

        await redis.delete(_k(KEY_GRAMMAR_PENDING, chat_id))
        msg = f"📝 문법 오류 {grammar_saved}개 등록됐어요. 내일부터 퀴즈에 나올게요!"
        if colloc_saved:
            msg += f"\n✅ 연어 {colloc_saved}개 단어장에도 등록됐어요!"
        await query.edit_message_text(msg)

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
