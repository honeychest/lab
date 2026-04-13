import logging

import redis.asyncio as aioredis
from telegram import Update
from telegram.ext import ContextTypes

from chs import dlog
from config import settings
from services import law_service, ai_service

logger = logging.getLogger(__name__)

redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

KEY_LAW_STATE = "nexus:law:state:{chat_id}"

_TELEGRAM_MAX = 4000


def _k(key: str, chat_id: int) -> str:
    return key.format(chat_id=chat_id)


async def handle_law(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    dlog("context.args 확인 — 인자 유무로 분기")
    chat_id = update.effective_chat.id
    if not context.args:
        dlog("인자 없는 경우: KEY_LAW_STATE = 'law' Redis 저장 (TTL 없음)")
        await redis.set(_k(KEY_LAW_STATE, chat_id), "law")
        dlog("인자 없는 경우: 법령 검색 모드 진입 안내 전송")
        await update.message.reply_text("📚 법령 검색 모드입니다.\n법령명을 입력하세요.\n(/exit 로 종료)")
    else:
        dlog("인자 있는 경우: _search_and_reply() 호출 — 모드 변경 없이 단건 검색")
        await _search_and_reply(update, " ".join(context.args))


async def handle_law_query(update: Update, chat_id: int, text: str) -> None:
    dlog("text_handler에서 law 상태 확인 후 호출되는 진입점")
    await _search_and_reply(update, text)


async def _search_and_reply(update: Update, query: str) -> None:
    dlog("'조사 중... ⏳' 로딩 메시지 전송")
    loading = await update.message.reply_text("조사 중... ⏳")

    dlog("law_service.research_law(query) 호출 — MCP chain_full_research")
    result = await law_service.research_law(query)

    dlog("결과 없으면 '관련 법령을 법제처에서 찾을 수 없어요.' 전송 후 종료")
    if not result:
        await loading.delete()
        await update.message.reply_text(f"'{query}'에 해당하는 법령을 법제처에서 찾을 수 없어요.")
        return

    await loading.delete()

    dlog("결과 길이 확인 — 4000자 이하면 바로 전송, 초과면 AI 요약 후 전송")
    if len(result) <= _TELEGRAM_MAX:
        await update.message.reply_text(result)
    else:
        dlog("ai_service.answer_law_query(result, query) 호출 — 길이 초과 시 요약")
        summary = await ai_service.answer_law_query(result, query)
        await update.message.reply_text(summary["summary"][:_TELEGRAM_MAX])
