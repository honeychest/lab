import logging

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from session import GrammarPending
from services import ai_service, notion_service, grammar_service

logger = logging.getLogger(__name__)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """grammar:* 콜백 처리."""
    query   = update.callback_query
    await query.answer()
    chat_id = query.message.chat_id
    data    = query.data
    gp      = GrammarPending(chat_id)

    if data.startswith("grammar:register:"):
        idx = int(data.split(":")[-1])
        info = await gp.get()
        if not info:
            await query.answer("⏰ 등록 정보가 만료됐어요.", show_alert=True)
            return
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
        grammar_errors.pop(idx)
        info["grammar_errors"] = grammar_errors
        if grammar_errors or collocation_errors:
            await gp.set(info)
        else:
            await gp.clear()
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
        info = await gp.get()
        if not info:
            await query.edit_message_text("⏰ 등록 정보가 만료됐어요.")
            return
        await query.edit_message_text("⏳ 등록 중...")
        collocation_errors = info.get("collocation_errors", [])
        saved = 0
        for expression in collocation_errors:
            existing = await notion_service.exists_word(expression)
            if not existing:
                word_info = await ai_service.explain_word(expression)
                await notion_service.add_word(word_info["word"] or expression, word_info["meaning_ko"])
                saved += 1
        await gp.clear()
        await query.edit_message_text(f"✅ 연어 {saved}개 단어장에 등록됐어요!")

    elif data == "grammar:skip":
        await query.edit_message_text("넘어갈게요!")
