import logging
import requests
from chs import dlog
from telegram import Update
from telegram.ext import ContextTypes
from services.github_service import get_repo_info
from services.ai_service import summarize_github, summarize_youtube, summarize_url
from services.notion_service import save, exists, delete_page
from handlers.url_handler import _get_platform

logger = logging.getLogger(__name__)

_TELEGRAM_MAX = 1500


async def handle_refresh(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data
    if data == "cancel":
        await query.edit_message_text("취소했습니다.")
        return

    if not data.startswith("refresh:"):
        return

    key = data[len("refresh:"):]
    url = context.user_data.pop(key, None) #조회 + 삭제 동시
    if not url:
        await query.edit_message_text("❌ 요청이 만료되었습니다. URL을 다시 보내주세요.")
        return
    await query.edit_message_text("🔄 갱신 중...")
    existing_id = await exists(url)
    platform = _get_platform(url)

    if platform == "github": # 깃허브 url 처리
        try:
            repo_info = await get_repo_info(url)
        except requests.HTTPError as e:
            msg = str(e)
            if msg.startswith("404"):
                reply = "❌ 레포를 찾을 수 없습니다."
            elif msg.startswith("rate_limit:"):
                secs = int(msg.split(":")[1])
                mins = max(1, secs // 60)
                reply = f"⏳ GitHub API 한도 초과. 약 {mins}분 후 다시 시도해주세요."
            else:
                reply = "❌ GitHub API 오류가 발생했습니다."
            await query.edit_message_text(reply)
            return
        result = await summarize_github(repo_info)
        await save(url, result["title"], result["summary"], platform="github")
        # 새 저장 성공 후 기존 페이지 삭제 (실패해도 새 데이터는 보존됨)
        if existing_id:
            await delete_page(existing_id)
        meta_line = f"⭐ {repo_info['stars']} | {repo_info['language']} | {repo_info['license']}"
        reply_text = f"{meta_line}\n\n{result['summary'][:_TELEGRAM_MAX]}"
        await query.edit_message_text(f"✔ 갱신 완료\n\n{reply_text}")
    elif platform in ("youtube", "shorts"): # youtube 관련 url 처리
        try:
            result = await summarize_youtube(url)
        except Exception:
            await query.edit_message_text("❌ 처리 중 오류가 발생했습니다.")
            return
        await save(url, result["title"], result["summary"], platform)
        if existing_id:
            await delete_page(existing_id)
        await query.edit_message_text(f"✔ 갱신 완료\n\n{result['summary'][:_TELEGRAM_MAX]}")
    else: # 일반 web 처리
        try:
            dlog("web 플랫폼 summarize_url() 호출")
            dlog("url 직접 Gemini에 전달 — url_context 브라우징")
            result = await summarize_url(url)
        except Exception:
            await query.edit_message_text("❌ 처리 중 오류가 발생했습니다.")
            return
        await save(url, result["title"], result["summary"], platform)
        if existing_id:
            await delete_page(existing_id)
        await query.edit_message_text(f"✔ 갱신 완료\n\n{result['summary'][:_TELEGRAM_MAX]}")