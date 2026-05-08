import json
import logging
import random
import time

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from chs import dlog
from session import QuizSession, GrammarPending
from services import ai_service, notion_service
from utils.strings import levenshtein

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



async def handle_quiz_answer(update: Update, chat_id: int, text: str) -> None:
    """퀴즈 답변 채점 후 결과 전송 및 다음 문제 출제."""
    qs = QuizSession(chat_id)
    session = await qs.get_session()
    if not session:
        await update.message.reply_text("진행 중인 퀴즈가 없어요.")
        return

    word       = session["word"]
    meaning_ko = session["meaning_ko"]
    stage      = session["stage"]
    page_id    = session["page_id"]
    question   = session.get("question", "")
    mode       = session.get("mode", "auto")

    if stage >= 3:
        word_used = word.lower() in text.lower()
        if not word_used:
            result = await ai_service.grade_writing(word, meaning_ko, question, text)
            if result["context_ok"]:
                await update.message.reply_text(f"⚠️ 의미는 맞지만 '{word}'를 직접 사용해야 해요. 다시 도전!")
                return
            else:
                correct = False
                reply = f"❌ 오답. '{word}'를 사용한 문장을 만들어보세요. 1단계로 돌아갑니다."
        else:
            result = await ai_service.grade_writing(word, meaning_ko, question, text)
            correct = result["used_correctly"]
            if correct:
                reply = "✅ 정답! 올바르게 사용했어요."
                alternatives = result.get("alternatives", [])
                if alternatives:
                    reply += "\n\n💡 비슷한 표현: " + " / ".join(alternatives)
            else:
                reply = f"❌ 오답. '{word}'를 올바른 맥락으로 사용해야 해요. 1단계로 돌아갑니다."

        grammar_errors     = result.get("grammar_errors", [])
        collocation_errors = result.get("collocation_errors", [])

        if correct and (grammar_errors or collocation_errors):
            if grammar_errors:
                error_lines = "\n".join(f"[{e['type']}] {e['detail']}" for e in grammar_errors)
                reply += f"\n\n⚠️ 문법 오류:\n{error_lines}"
            if collocation_errors:
                reply += f"\n\n💡 연어 등록 추천:\n" + "\n".join(collocation_errors)

            await GrammarPending(chat_id).set({
                "expression": word,
                "wrong_sentence": text,
                "grammar_errors": grammar_errors,
                "collocation_errors": collocation_errors,
            })

            keyboard = []
            for i, err in enumerate(grammar_errors):
                keyboard.append([InlineKeyboardButton(f"📝 [{err['type']}] 등록", callback_data=f"grammar:register:{i}")])
            last_row = []
            if collocation_errors:
                last_row.append(InlineKeyboardButton("✅ 단어장 등록", callback_data="grammar:register_collocation"))
            last_row.append(InlineKeyboardButton("넘어가기", callback_data="grammar:skip"))
            keyboard.append(last_row)
            await update.message.reply_text(reply, reply_markup=InlineKeyboardMarkup(keyboard))
        else:
            await update.message.reply_text(reply)
    else:
        correct = text.strip().lower() == word.lower()
        if correct:
            await update.message.reply_text("✅ 정답!")
        else:
            distance = levenshtein(text, word)
            retry_count = session.get("retry_count", 0)
            if distance <= 2 and retry_count == 0:
                session["retry_count"] = 1
                await qs.set_session(session)
                await update.message.reply_text("오타인 것 같아요! 다시 한번! 🔄")
                return
            await update.message.reply_text(f"❌ 오답. 정답은 '{word}'예요. 1단계로 돌아갑니다.")

    if not (mode == "quiz" and correct):
        await notion_service.update_word_stage(page_id, correct)

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


async def _send_next_quiz(update: Update, chat_id: int, exclude_page_id: str | None = None, _depth: int = 0) -> None:
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
        body = f"{pf['meaning_ko']}\n\n{pf['question']}" if pf["stage"] == 1 else pf["question"]
        await update.effective_message.reply_text(
            f"{progress} {_stage_icon(pf['stage'])} {pf['stage']}단계\n{body}",
            reply_markup=_quiz_buttons(),
        )
        _asyncio.create_task(_prefetch_next_question(chat_id, mode, pf["page_id"]))
        return

    if mode == "quiz":
        words = await notion_service.get_all_words()
        if exclude_page_id:
            words = [w for w in words if w["id"] != exclude_page_id]
        if not words:
            await qs.clear_state()
            await update.effective_message.reply_text("단어장이 비어있어요!")
            return
        pool = words[:100]
        random.shuffle(pool)
        page = pool[0]
    else:
        words = await notion_service.get_words_due()
        if not words:
            await qs.set_count(0)
            await qs.clear_state()
            await update.effective_message.reply_text("오늘 복습할 단어가 없어요!")
            return
        if exclude_page_id:
            words = [w for w in words if w["id"] != exclude_page_id]
        if not words:
            await qs.set_count(0)
            await qs.clear_state()
            await update.effective_message.reply_text("오늘 복습할 단어가 없어요!")
            return
        page = words[0]

    parsed = notion_service.parse_word_page(page)
    if not parsed:
        if _depth >= 3:
            logger.warning(f"_send_next_quiz: 파싱 가능한 단어 없음 — chat_id: {chat_id}")
            await update.effective_message.reply_text("오늘 복습할 단어가 없어요!")
            return
        await _send_next_quiz(update, chat_id, _depth=_depth + 1)
        return

    if mode == "auto":
        progress_info = await qs.consume_count()
        if progress_info is None:
            await qs.clear_active()
            await update.effective_message.reply_text("🎉 오늘 퀴즈 완료! 수고했어요 💪")
            return
        remaining, total = progress_info

    loading = await update.effective_message.reply_text("다음 문제 출제 중... ⏳")
    question = await ai_service.generate_quiz(parsed["word"], parsed["meaning_ko"], parsed["stage"])
    await loading.delete()

    await qs.set_session({
        "word": parsed["word"], "meaning_ko": parsed["meaning_ko"], "stage": parsed["stage"],
        "page_id": parsed["page_id"], "question": question, "mode": mode,
    })
    await qs.set_state("quiz")

    progress = QuizSession.format_progress(remaining, total) if mode == "auto" else "[🔄]"
    body = f"{parsed['meaning_ko']}\n\n{question}" if parsed["stage"] == 1 else question
    await update.effective_message.reply_text(
        f"{progress} {_stage_icon(parsed['stage'])} {parsed['stage']}단계\n{body}",
        reply_markup=_quiz_buttons(),
    )
    import asyncio as _asyncio
    _asyncio.create_task(_prefetch_next_question(chat_id, mode, parsed["page_id"]))


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

    due_words = await notion_service.get_words_due()
    if not due_words:
        await qs.set_count(0)
        await query.message.reply_text("오늘 복습할 단어가 없어요")
        return

    parsed = None
    for candidate in due_words:
        parsed = notion_service.parse_word_page(candidate)
        if parsed:
            break

    if not parsed:
        await query.message.reply_text("오늘 복습할 단어가 없어요")
        return

    progress_info = await qs.consume_count()
    if progress_info is None:
        await query.answer("오늘 퀴즈를 모두 완료했어요 ✔", show_alert=True)
        return
    remaining, total = progress_info

    loading = await query.message.reply_text("다음 문제 출제 중... ⏳")
    question = await ai_service.generate_quiz(parsed["word"], parsed["meaning_ko"], parsed["stage"])
    await loading.delete()

    await qs.set_session({
        "word": parsed["word"], "meaning_ko": parsed["meaning_ko"], "stage": parsed["stage"],
        "page_id": parsed["page_id"], "question": question, "mode": "auto",
    })
    await qs.set_state("quiz")

    progress = QuizSession.format_progress(remaining, total)
    body = f"{parsed['meaning_ko']}\n\n{question}" if parsed["stage"] == 1 else question
    await query.message.reply_text(
        f"{progress} {_stage_icon(parsed['stage'])} {parsed['stage']}단계\n{body}",
        reply_markup=_quiz_buttons(),
    )
    logger.info(f"스케줄 퀴즈 시작 — chat_id: {chat_id}, 단어: {parsed['word']}, 단계: {parsed['stage']}")
    asyncio.create_task(_prefetch_next_question(chat_id, "auto", parsed["page_id"]))


async def handle_quiz_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/quiz 명령어 — 카운트 초기화 후 즉시 첫 문제 출제."""
    import asyncio
    chat_id = update.effective_chat.id
    qs = QuizSession(chat_id)

    await qs.resume()
    await qs.clear_prefetch()
    await qs.reset_count()

    all_words = await notion_service.get_all_words()
    if not all_words:
        await update.message.reply_text("단어장이 비어있어요! 단어를 추가해봐요 😊")
        return

    pool = all_words[:100]
    random.shuffle(pool)

    parsed = None
    for candidate in pool:
        parsed = notion_service.parse_word_page(candidate)
        if parsed:
            break

    if not parsed:
        await update.message.reply_text("유효한 단어가 없어요. 단어를 추가해봐요 😊")
        return

    loading = await update.message.reply_text("다음 문제 출제 중... ⏳")
    question = await ai_service.generate_quiz(parsed["word"], parsed["meaning_ko"], parsed["stage"])
    await loading.delete()

    await qs.set_session({
        "word": parsed["word"], "meaning_ko": parsed["meaning_ko"], "stage": parsed["stage"],
        "page_id": parsed["page_id"], "question": question, "mode": "quiz",
    })
    await qs.set_state("quiz")

    body = f"{parsed['meaning_ko']}\n\n{question}" if parsed["stage"] == 1 else question
    await update.message.reply_text(
        f"[🔄] {_stage_icon(parsed['stage'])} {parsed['stage']}단계\n{body}",
        reply_markup=_quiz_buttons(),
    )
    logger.info(f"/quiz 시작 — chat_id: {chat_id}, 단어: {parsed['word']}, 단계: {parsed['stage']}")
    asyncio.create_task(_prefetch_next_question(chat_id, "quiz", parsed["page_id"]))


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
        await query.edit_message_text(
            f"↩ 퀴즈로 돌아왔어요!\n{_stage_icon(session['stage'])} {session['stage']}단계\n{session['question']}",
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
        session = await qs.get_session()
        if not session:
            await query.answer("진행 중인 퀴즈가 없어요.", show_alert=True)
            return
        await query.answer()
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text(f"❌ 실패. 정답은 '{session['word']}'예요. 1단계로 돌아갑니다.")
        await notion_service.update_word_stage(session["page_id"], correct=False)
        await _send_next_quiz(update, chat_id, exclude_page_id=session["page_id"])

    elif data == "quiz:end":
        await qs.clear_active()
        await qs.resume()
        await query.edit_message_text("오늘은 여기까지! 내일 또 봐요 💪")
