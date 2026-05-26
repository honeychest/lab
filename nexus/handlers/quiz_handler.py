import logging

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from session import QuizSession
from services import ai_service, notion_service
from services.quiz_flow import QuizAnswerFeedback, QuizComplete, QuizTurn, create_quiz_flow

logger = logging.getLogger(__name__)


# [AGENT]
# 자동 퀴즈(auto)는 QuizSession.consume_count()로 1 차감하고,
# 표시 문구는 QuizSession.format_progress()의 [완료/전체] 형식으로 통일한다.


def _quiz_buttons() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("힌트", callback_data="quiz:hint"),
        InlineKeyboardButton("질문", callback_data="quiz:word_query"),
        InlineKeyboardButton("실패", callback_data="quiz:fail"),
        InlineKeyboardButton("중지", callback_data="quiz:pause"),
    ]])


def _quiz_pause_buttons() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("힌트", callback_data="quiz:hint"),
        InlineKeyboardButton("질문", callback_data="quiz:word_query"),
        InlineKeyboardButton("실패", callback_data="quiz:fail"),
        InlineKeyboardButton("재개", callback_data="quiz:resume"),
    ]])


def _stage_icon(stage: int) -> str:
    return '✏️ 작문' if stage >= 3 else '🧩'


def _format_quiz_body(word: str, meaning_ko: str, stage: int, question: str) -> str:
    """stage별 문제 본문 포맷. stage 3은 첫글자 힌트 + 뜻 + 상황 문장."""
    logger.info(f"[debug] _format_quiz_body: word={word!r}, stage={stage!r} (type={type(stage).__name__}), meaning_ko={meaning_ko!r}")
    if stage >= 3:
        first_letter_hint = " ".join(w[0] + "____" for w in word.split())
        return f"{first_letter_hint} {meaning_ko}\n{question}"
    if stage == 1:
        return f"{meaning_ko}\n\n{question}"
    return question



async def handle_quiz_answer(update: Update, chat_id: int, text: str) -> None:
    """퀴즈 답변 채점 후 결과 전송 및 다음 문제 출제."""
    qs = QuizSession(chat_id)
    session = await qs.get_session()

    # 교정 작문 상태면 교정 채점 처리
    if session and session.get("correction_pending"):
        await _handle_correction_answer(update, chat_id, text, session)
        return

    result = await create_quiz_flow(chat_id).grade_answer(text)
    if not isinstance(result, QuizAnswerFeedback):
        await update.message.reply_text(result.message)
        return

    if result.needs_correction:
        # 정답이지만 문법 오류 → 교정 기회 1회
        if session:
            session["correction_pending"] = True
            await qs.set_session(session)
        keyboard = []
        for i, err in enumerate(result.grammar_errors or []):
            keyboard.append([InlineKeyboardButton(f"📝 [{err['type']}] 등록", callback_data=f"grammar:register:{i}")])
        last_row = []
        if result.collocation_errors:
            last_row.append(InlineKeyboardButton("✅ 단어장 등록", callback_data="grammar:register_collocation"))
        last_row.append(InlineKeyboardButton("넘어가기", callback_data="quiz:skip_correction"))
        keyboard.append(last_row)
        await update.message.reply_text(result.reply, reply_markup=InlineKeyboardMarkup(keyboard))
        return

    if result.grammar_errors or result.collocation_errors:
        keyboard = []
        for i, err in enumerate(result.grammar_errors or []):
            keyboard.append([InlineKeyboardButton(f"📝 [{err['type']}] 등록", callback_data=f"grammar:register:{i}")])
        last_row = []
        if result.collocation_errors:
            last_row.append(InlineKeyboardButton("✅ 단어장 등록", callback_data="grammar:register_collocation"))
        last_row.append(InlineKeyboardButton("넘어가기", callback_data="grammar:skip"))
        keyboard.append(last_row)
        await update.message.reply_text(result.reply, reply_markup=InlineKeyboardMarkup(keyboard))
    else:
        await update.message.reply_text(result.reply)

    if not result.should_continue:
        return
    await _send_next_quiz(update, chat_id, exclude_page_id=result.next_exclude_page_id)


async def _handle_correction_answer(update: Update, chat_id: int, text: str, session: dict) -> None:
    """교정 작문 1회 채점 후 피드백, 다음 문제로."""
    qs = QuizSession(chat_id)
    word = session["word"]
    meaning_ko = session["meaning_ko"]
    question = session.get("question", "")
    page_id = session["page_id"]

    session["correction_pending"] = False
    session.pop("writing_retry", None)
    await qs.set_session(session)

    result = await ai_service.grade_writing(word, meaning_ko, question, text)
    grammar_errors = result.get("grammar_errors", [])

    if not grammar_errors:
        await update.message.reply_text("✅ 깔끔해요! 잘 고쳤어요 👏")
    else:
        error_lines = "\n".join(f"⚠️ [{e['type']}] {e['detail']}" for e in grammar_errors)
        example = result.get("example_sentence", "")
        reply = error_lines
        if example:
            reply += f"\n💡 모범답안: {example}"
        await update.message.reply_text(reply)

    await _send_next_quiz(update, chat_id, exclude_page_id=page_id)


async def _prefetch_next_question(chat_id: int, mode: str, exclude_page_id: str | None) -> None:
    import random as _random
    qs = QuizSession(chat_id)
    try:
        if mode == "quiz":
            words = await notion_service.get_all_words()
            if exclude_page_id:
                words = [w for w in words if w["id"] != exclude_page_id]
            if not words:
                return
            pool = words[:100]
            _random.shuffle(pool)
            page = pool[0]
        else:
            words = await notion_service.get_words_due()
            if not words:
                return
            if exclude_page_id:
                words = [w for w in words if w["id"] != exclude_page_id]
            if not words:
                return
            page = words[0]

        parsed = notion_service.parse_word_page(page)
        if not parsed:
            return

        question, definition = await ai_service.generate_quiz_with_hint(
            parsed["word"], parsed["meaning_ko"], parsed["stage"]
        )
        await qs.set_prefetch({**parsed, "question": question, "definition": definition, "mode": mode})
    except Exception as e:
        logger.warning(f"[prefetch] 실패 — chat_id: {chat_id}, 오류: {e}")


async def _send_next_quiz(update: Update, chat_id: int, exclude_page_id: str | None = None) -> None:
    """다음 문제 출제. 세션의 mode에 따라 자동출제/전체퀴즈 구분."""
    import asyncio as _asyncio
    qs = QuizSession(chat_id)

    session = await qs.get_session()
    mode = session.get("mode", "auto") if session else "auto"

    pf = await qs.pop_prefetch()
    if pf:
        if mode == "auto":
            progress_info = await qs.consume_count()
            if progress_info is None:
                await qs.clear_active()
                await update.effective_message.reply_text("🎉 오늘 퀴즈 완료! 수고했어요 💪")
                return
            remaining, total = progress_info
        await qs.set_session({
            "word": pf["word"], "meaning_ko": pf["meaning_ko"], "stage": pf["stage"],
            "page_id": pf["page_id"], "question": pf["question"],
            "definition": pf.get("definition", ""), "mode": mode,
        })
        await qs.set_state("quiz")
        progress = QuizSession.format_progress(remaining, total) if mode == "auto" else "[🔄]"
        body = _format_quiz_body(pf["word"], pf["meaning_ko"], pf["stage"], pf["question"])
        await update.effective_message.reply_text(
            f"{progress} {_stage_icon(pf['stage'])} {pf['stage']}단계\n{body}",
            reply_markup=_quiz_buttons(),
        )
        _asyncio.create_task(_prefetch_next_question(chat_id, mode, pf["page_id"]))
        return

    loading = await update.effective_message.reply_text("다음 문제 출제 중... ⏳")
    result = await create_quiz_flow(chat_id).start_next_quiz(
        mode=mode,
        exclude_page_id=exclude_page_id,
    )
    await loading.delete()

    if isinstance(result, QuizComplete):
        await update.effective_message.reply_text(result.message)
        return
    if not isinstance(result, QuizTurn):
        if mode == "auto":
            logger.warning(f"_send_next_quiz: 파싱 가능한 단어 없음 — chat_id: {chat_id}")
        await update.effective_message.reply_text(result.message)
        return

    body = _format_quiz_body(result.word, result.meaning_ko, result.stage, result.body)
    await update.effective_message.reply_text(
        f"{result.progress} {_stage_icon(result.stage)} {result.stage}단계\n{body}",
        reply_markup=_quiz_buttons(),
    )
    import asyncio as _asyncio
    _asyncio.create_task(_prefetch_next_question(chat_id, mode, result.page_id))


async def handle_quiz_start_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """스케줄 메시지 [시작] 버튼 콜백."""
    import asyncio
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id

    qs = QuizSession(chat_id)
    await qs.resume()

    count = await qs.get_count()
    if not count or count <= 0:
        await query.answer("오늘 퀴즈를 모두 완료했어요 ✔", show_alert=True)
        return

    loading = await query.message.reply_text("다음 문제 출제 중... ⏳")
    result = await create_quiz_flow(chat_id).start_auto_quiz()
    await loading.delete()

    if isinstance(result, QuizComplete):
        await query.answer("오늘 퀴즈를 모두 완료했어요 ✔", show_alert=True)
        return
    if not isinstance(result, QuizTurn):
        await query.message.reply_text(result.message)
        return

    body = _format_quiz_body(result.word, result.meaning_ko, result.stage, result.body)
    await query.message.reply_text(
        f"{result.progress} {_stage_icon(result.stage)} {result.stage}단계\n{body}",
        reply_markup=_quiz_buttons(),
    )
    logger.info(f"스케줄 퀴즈 시작 — chat_id: {chat_id}, 단어: {result.word}, 단계: {result.stage}")
    asyncio.create_task(_prefetch_next_question(chat_id, "auto", result.page_id))


async def handle_quiz_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/quiz 명령어 — 카운트 초기화 후 즉시 첫 문제 출제."""
    import asyncio
    chat_id = update.effective_chat.id

    loading = await update.message.reply_text("다음 문제 출제 중... ⏳")
    result = await create_quiz_flow(chat_id).start_practice_quiz()
    await loading.delete()

    if not isinstance(result, QuizTurn):
        await update.message.reply_text(result.message)
        return

    body = _format_quiz_body(result.word, result.meaning_ko, result.stage, result.body)
    await update.message.reply_text(
        f"{result.progress} {_stage_icon(result.stage)} {result.stage}단계\n{body}",
        reply_markup=_quiz_buttons(),
    )
    logger.info(f"/quiz 시작 — chat_id: {chat_id}, 단어: {result.word}, 단계: {result.stage}")
    asyncio.create_task(_prefetch_next_question(chat_id, "quiz", result.page_id))


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """quiz:* 콜백 처리."""
    query = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    data    = query.data
    qs      = QuizSession(chat_id)

    if data == "quiz:start":
        await handle_quiz_start_callback(update, context)

    elif data == "quiz:hint":
        session = await qs.get_session()
        if not session:
            await query.answer("진행 중인 퀴즈가 없어요.", show_alert=True)
            return
        word       = session["word"]
        meaning_ko = session["meaning_ko"]
        hint = " ".join(w[0] + "_" * (len(w) - 1) for w in word.split())
        await query.answer()
        definition = session.get("definition") or await ai_service.get_word_definition(word)
        await query.message.reply_text(f"💡 힌트: {hint}\n{meaning_ko}\n{definition}")

    elif data == "quiz:word_query":
        await qs.set_state("word")
        await query.edit_message_text(
            query.message.text + "\n\n🔤 어떤 단어가 궁금해요? 입력해주세요.",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("↩ 퀴즈로 돌아가기", callback_data="quiz:back")
            ]])
        )

    elif data == "quiz:back":
        session = await qs.get_session()
        if not session:
            await query.edit_message_text("진행 중인 퀴즈가 없어요.")
            return
        await qs.set_state("quiz")
        body = _format_quiz_body(session["word"], session["meaning_ko"], session["stage"], session["question"])
        await query.edit_message_text(
            f"↩ 퀴즈로 돌아왔어요!\n{_stage_icon(session['stage'])} {session['stage']}단계\n{body}",
            reply_markup=_quiz_buttons(),
        )

    elif data == "quiz:pause":
        await qs.pause()
        await query.edit_message_reply_markup(reply_markup=_quiz_pause_buttons())

    elif data == "quiz:resume":
        await qs.resume()
        session = await qs.get_session()
        if not session:
            await query.answer("퀴즈 세션이 만료됐어요. 내일 다시 시작해요!", show_alert=True)
            return
        await query.edit_message_reply_markup(reply_markup=_quiz_buttons())

    elif data == "quiz:fail":
        result = await create_quiz_flow(chat_id).fail_current_quiz()
        if not isinstance(result, QuizAnswerFeedback):
            await query.answer("진행 중인 퀴즈가 없어요.", show_alert=True)
            return
        await query.answer()
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(result.reply)
        await _send_next_quiz(update, chat_id, exclude_page_id=result.next_exclude_page_id)

    elif data == "quiz:skip_correction":
        session = await qs.get_session()
        if session:
            session["correction_pending"] = False
            page_id = session["page_id"]
            await qs.set_session(session)
            await query.edit_message_reply_markup(reply_markup=None)
            await _send_next_quiz(update, chat_id, exclude_page_id=page_id)
        else:
            await query.edit_message_reply_markup(reply_markup=None)
            await query.message.reply_text("세션이 만료됐어요. 새 퀴즈를 시작할게요.")
            await _send_next_quiz(update, chat_id, exclude_page_id=None)

    elif data == "quiz:end":
        await qs.clear_active()
        await qs.resume()
        await query.edit_message_text("오늘은 여기까지! 내일 또 봐요 💪")
