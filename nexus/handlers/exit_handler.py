import logging

from telegram import Update
from telegram.ext import ContextTypes

from session import QuizSession, LawState

logger = logging.getLogger(__name__)


async def handle_exit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    await QuizSession(chat_id).clear_all()
    await LawState(chat_id).clear()
    await update.message.reply_text("일반 모드로 돌아왔어요.")
