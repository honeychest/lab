import logging

from telegram import Update
from telegram.ext import ContextTypes

from chs import dlog
from handlers.text_handler import KEY_QUIZ_STATE, KEY_QUIZ_SESSION, KEY_QUIZ_PAUSE, _k, redis
from handlers.law_handler import KEY_LAW_STATE

logger = logging.getLogger(__name__)


async def handle_exit(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    dlog("chat_id 추출")
    chat_id = update.effective_chat.id

    dlog("퀴즈 Redis 키 삭제 — KEY_QUIZ_STATE, KEY_QUIZ_SESSION, KEY_QUIZ_PAUSE")
    await redis.delete(
        _k(KEY_QUIZ_STATE, chat_id),
        _k(KEY_QUIZ_SESSION, chat_id),
        _k(KEY_QUIZ_PAUSE, chat_id),
    )

    dlog("법령 Redis 키 삭제 — KEY_LAW_STATE")
    await redis.delete(_k(KEY_LAW_STATE, chat_id))

    dlog("'일반 모드로 돌아왔어요.' 메시지 전송")
    await update.message.reply_text("일반 모드로 돌아왔어요.")
