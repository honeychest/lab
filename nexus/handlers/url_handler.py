import logging
from telegram import Update
from telegram.ext import ContextTypes
from services.youtube_service import get_transcript
from services.webpage_service import get_content
from services.ai_service import summarize
from services.notion_service import save

logger = logging.getLogger(__name__)


async def handle_url(update: Update, context: ContextTypes.DEFAULT_TYPE):
    url = update.message.text.strip()
    await update.message.reply_text("🔍 분석 중...")

    try:
        if _is_youtube(url):
            text = await get_transcript(url)
        else:
            text = await get_content(url)
        result = await summarize(text, url) # result에 ai_service 에서 summarize 한 내용이 여기 들어옴.
        await save(url, result["title"], result["summary"])

        await update.message.reply_text(f"✔ 노션 저장 완료\n\n{result['summary']}")

    except Exception as e:
        logger.error(f"URL 처리 실패: {e}")
        await update.message.reply_text("❌ 처리 중 오류가 발생했습니다.")

def _is_youtube(url: str) -> bool:
    return "youtube.com/watch" in url or "youtu.be/" in url or "youtube.com/shorts/" in url