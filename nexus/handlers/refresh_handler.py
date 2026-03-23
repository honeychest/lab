import logging
import requests
from telegram import Update
from telegram.ext import ContextTypes
from services.github_service import get_repo_info
from services.ai_service import summarize_github
from services.notion_service import save, exists, delete_page

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

    url = data[len("refresh:"):]
    await query.edit_message_text("🔄 갱신 중...")

    existing_id = await exists(url)

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