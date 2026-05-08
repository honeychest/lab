import logging

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from session import LawState, QuizSession, InboxPending
from handlers.law_handler import handle_law_query
from handlers.url_handler import handle_url
from handlers import quiz_handler, word_handler, grammar_handler
from handlers.callback_codec import INBOX_SHORT_CONFIRM, INBOX_SHORT_CANCEL, inbox_kind

logger = logging.getLogger(__name__)


def _contains_hangul(text: str) -> bool:
    return any('가' <= c <= '힯' for c in text)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """텍스트 메시지 수신 시 상태에 따라 분기."""
    chat_id = update.effective_chat.id
    text = update.message.text.strip()

    if await LawState(chat_id).is_active():
        await handle_law_query(update, chat_id, text)
        return

    if "http" in text:
        await handle_url(update, context)
        return

    if text.startswith("/"):
        logger.warning(f"분기 3 도달 불가 (filters.COMMAND가 차단해야 함) - chat_id: {chat_id}, text: {text}")
        return

    qs = QuizSession(chat_id)
    if await qs.get_state() == "quiz" and not await qs.is_paused():
        await quiz_handler.handle_quiz_answer(update, chat_id, text)
        return

    if not _contains_hangul(text):
        await word_handler.handle_word_query(update, chat_id, text)
        return

    # 한글 입력 — inbox 분기
    inbox = InboxPending(chat_id)
    if len(text) <= 3:
        await inbox.set({"short_confirm": text})
        buttons = [[
            InlineKeyboardButton("맞아요", callback_data=INBOX_SHORT_CONFIRM),
            InlineKeyboardButton("아니에요", callback_data=INBOX_SHORT_CANCEL),
        ]]
        await update.message.reply_text(
            f"'{text}' — 올바르게 입력되었나요?",
            reply_markup=InlineKeyboardMarkup(buttons),
        )
    else:
        await inbox.set({"text": text})
        buttons = [[
            InlineKeyboardButton("할일", callback_data=inbox_kind("할일")),
            InlineKeyboardButton("아이디어", callback_data=inbox_kind("아이디어")),
            InlineKeyboardButton("취소", callback_data=inbox_kind("취소")),
        ]]
        await update.message.reply_text(
            "종류를 선택해주세요",
            reply_markup=InlineKeyboardMarkup(buttons),
        )


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """quiz:* / word:* / grammar:* 콜백을 각 핸들러로 위임."""
    data = update.callback_query.data

    if data.startswith("quiz:"):
        await quiz_handler.handle_callback(update, context)
    elif data.startswith("word:"):
        await word_handler.handle_callback(update, context)
    elif data.startswith("grammar:"):
        await grammar_handler.handle_callback(update, context)
