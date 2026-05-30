import logging
import requests
import uuid
from chs import dlog
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes
from services.github_service import get_repo_info
from services.ai_service import summarize_github, summarize_youtube, summarize_url, summarize_reddit
from services.notion_service import save, exists
logger = logging.getLogger(__name__)

_TELEGRAM_MAX = 1500  # 텔레그램 요약 최대 글자 수

_PLATFORM_RULES = [
    (lambda url: "github.com/" in url,                          "github"),
    (lambda url: "youtube.com/shorts/" in url,                  "shorts"),
    (lambda url: "youtube.com/watch" in url or "youtu.be/" in url, "youtube"),
    (lambda url: "reddit.com/" in url,                          "reddit"),
]


def _github_error_reply(msg: str) -> str:
    if msg.startswith("404"):
        return "❌ 레포를 찾을 수 없습니다. 비공개이거나 존재하지 않는 레포입니다."
    if msg.startswith("rate_limit:"):
        secs = int(msg.split(":")[1])
        mins = max(1, secs // 60)
        return f"⏳ GitHub API 한도 초과. 약 {mins}분 후 다시 시도해주세요."
    return "❌ GitHub API 오류가 발생했습니다."


def _get_platform(url: str) -> str:
    for check, platform in _PLATFORM_RULES:
        if check(url):
            return platform
    return "web"


async def handle_url(update: Update, context: ContextTypes.DEFAULT_TYPE):
    url = update.message.text.strip()
    if not url:
        await update.message.reply_text("❌ 주소파싱에 실패했습니다. 올바른 주소를 입력해주세요.")
        return
    else:
        url = url.split()[0]
    try:
        platform = _get_platform(url)

        existing_id = await exists(url)
        if existing_id:
            key = uuid.uuid4().hex[:8]
            context.user_data[key] = url
            keyboard = InlineKeyboardMarkup([
                [
                    InlineKeyboardButton("갱신하기", callback_data=f"refresh:{key}"),
                    InlineKeyboardButton("취소", callback_data="cancel"),
                ]
            ])
            await update.message.reply_text("이미 저장된 URL입니다. 갱신하시겠습니까?", reply_markup=keyboard)
            return

        await update.message.reply_text("🔍 분석 중...")

        if platform == "github":
            from services.github_service import _parse_github_url
            if _parse_github_url(url):
                await _handle_github(update, context, url)
            else:
                await _handle_generic(update, url, "web")
        else:
            await _handle_generic(update, url, platform)

    except Exception as e:
        logger.error(f"URL 처리 실패: {e}")
        await _log_failure(url, str(e))
        await update.message.reply_text("❌ 처리 중 오류가 발생했습니다.")


async def _handle_github(update: Update, context: ContextTypes.DEFAULT_TYPE, url: str):
    try:
        repo_info = await get_repo_info(url)
    except requests.HTTPError as e:
        msg = str(e)
        await _log_failure(url, msg)
        await update.message.reply_text(_github_error_reply(msg))
        return

    result = await summarize_github(repo_info)
    await save(url, result["title"], result["summary"], platform="github", tags=result.get("tags"))

    meta_line = f"⭐ {repo_info['stars']} | {repo_info['language']} | {repo_info['license']}"
    reply_text = f"{meta_line}\n\n{result['summary'][:_TELEGRAM_MAX]}"
    await update.message.reply_text(f"✔ 노션 저장 완료\n\n{reply_text}")


async def _handle_generic(update: Update, url: str, platform: str):
    try:
        if platform in ("youtube", "shorts"):
            result = await summarize_youtube(url)
        elif platform == "reddit":
            result = await summarize_reddit(url)
        else:
            dlog("web 플랫폼 summarize_url() 호출")
            dlog("url 직접 Gemini에 전달 — url_context 브라우징")
            result = await summarize_url(url)
    except Exception as e:
        await _log_failure(url, str(e))
        raise

    await save(url, result["title"], result["summary"], platform, tags=result.get("tags"))
    await update.message.reply_text(f"✔ 노션 저장 완료\n\n{result['summary'][:_TELEGRAM_MAX]}")


async def _log_failure(url: str, error: str):
    """처리 실패 시 Notion에 오류 로그 저장."""
    logger.warning(f"{url}처리중 오류 발생. {error}")
    try:
        await save(url, f"[오류] {url[:50]}", f"오류 내용:\n{error}", platform="error")
    except Exception as log_err:
        logger.warning(f"오류 로그 Notion 저장 실패: {log_err}")
