import logging
import requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from services.youtube_service import get_transcript, TranscriptUnavailable, TranscriptBlocked
from services.webpage_service import get_content
from services.github_service import get_repo_info
from services.ai_service import summarize, summarize_github
from services.notion_service import save, exists
from config import settings

logger = logging.getLogger(__name__)

_TELEGRAM_MAX = 1500  # 텔레그램 요약 최대 글자 수


async def handle_url(update: Update, context: ContextTypes.DEFAULT_TYPE):
    url = update.message.text.strip()
    await update.message.reply_text("🔍 분석 중...")

    try:
        if _is_github(url):
            await _handle_github(update, context, url)
        elif _is_shorts(url) and not settings.YOUTUBE_SHORTS_ENABLED:
            await update.message.reply_text("youtube shorts 는 6/1 이후 맥미니에서만 가능합니다.")
        elif _is_youtube(url):
            await _handle_generic(update, url, platform="youtube")
        else:
            await _handle_generic(update, url, platform="web")

    except Exception as e:
        logger.error(f"URL 처리 실패: {e}")
        await _log_failure(url, str(e))
        await update.message.reply_text("❌ 처리 중 오류가 발생했습니다.")


async def _handle_github(update: Update, context: ContextTypes.DEFAULT_TYPE, url: str):
    # 중복 확인
    existing_id = await exists(url)
    if existing_id:
        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("갱신하기", callback_data=f"refresh:{url}"),
                InlineKeyboardButton("취소", callback_data="cancel"),
            ]
        ])
        await update.message.reply_text(
            "이미 저장된 레포입니다. 갱신하시겠습니까?",
            reply_markup=keyboard,
        )
        return

    try:
        repo_info = await get_repo_info(url)
    except requests.HTTPError as e:
        msg = str(e)
        if msg.startswith("404"):
            reply = "❌ 레포를 찾을 수 없습니다. 비공개이거나 존재하지 않는 레포입니다."
        elif msg.startswith("rate_limit:"):
            secs = int(msg.split(":")[1])
            mins = max(1, secs // 60)
            reply = f"⏳ GitHub API 한도 초과. 약 {mins}분 후 다시 시도해주세요."
        else:
            reply = "❌ GitHub API 오류가 발생했습니다."
        await _log_failure(url, msg)
        await update.message.reply_text(reply)
        return

    result = await summarize_github(repo_info)
    await save(url, result["title"], result["summary"], platform="github")

    meta_line = f"⭐ {repo_info['stars']} | {repo_info['language']} | {repo_info['license']}"
    reply_text = f"{meta_line}\n\n{result['summary'][:_TELEGRAM_MAX]}"
    await update.message.reply_text(f"✔ 노션 저장 완료\n\n{reply_text}")


async def _handle_generic(update: Update, url: str, platform: str):
    try:
        if platform in ("youtube", "shorts"):
            text = await get_transcript(url)
        else:
            text = await get_content(url)
    except (TranscriptUnavailable, TranscriptBlocked) as e:
        await _log_failure(url, str(e))
        await update.message.reply_text("⚠️ YouTube 영상을 처리할 수 없습니다. (자막 없음 또는 접근 차단)")
        return
    except Exception as e:
        await _log_failure(url, str(e))
        raise

    result = await summarize(text, url)
    await save(url, result["title"], result["summary"], platform)
    await update.message.reply_text(f"✔ 노션 저장 완료\n\n{result['summary'][:_TELEGRAM_MAX]}")


async def _log_failure(url: str, error: str):
    """처리 실패 시 Notion에 오류 로그 저장."""
    try:
        await save(url, f"[오류] {url[:50]}", f"오류 내용:\n{error}", platform="error")
    except Exception as log_err:
        logger.warning(f"오류 로그 Notion 저장 실패: {log_err}")


def _is_shorts(url: str) -> bool:
    return "youtube.com/shorts/" in url


def _is_youtube(url: str) -> bool:
    return "youtube.com/watch" in url or "youtu.be/" in url


def _is_github(url: str) -> bool:
    return "github.com/" in url