import logging

from telegram import Update
from telegram.ext import ContextTypes

from chs import dlog
from session import LawState
from services import law_service, ai_service

logger = logging.getLogger(__name__)

_TELEGRAM_MAX = 4000


async def handle_law(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if not context.args:
        await LawState(chat_id).activate()
        await update.message.reply_text("📚 법령 검색 모드입니다.\n법령명을 입력하세요.\n(/exit 로 종료)")
    else:
        await _search_and_reply(update, " ".join(context.args))


async def handle_law_query(update: Update, chat_id: int, text: str) -> None:
    await _search_and_reply(update, text)


async def _search_and_reply(update: Update, query: str) -> None:
    loading = await update.message.reply_text("조사 중... ⏳")
    result = await law_service.research_law(query)

    if not result:
        await loading.delete()
        await update.message.reply_text(f"'{query}'에 해당하는 법령을 법제처에서 찾을 수 없어요.")
        return

    await loading.delete()

    if len(result) <= _TELEGRAM_MAX:
        await update.message.reply_text(result)
    else:
        summary = await ai_service.answer_law_query(result, query)
        await update.message.reply_text(summary["summary"][:_TELEGRAM_MAX])
