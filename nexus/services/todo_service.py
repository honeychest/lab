import logging
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from chs import dlog
from redis_client import redis, _k, KEY_QUIZ_COUNT, KEY_INBOX_CB
from services import notion_service

logger = logging.getLogger(__name__)


async def build_schedule_content(chat_id: int, hour: int) -> list:
    """스케줄 메시지 본문·키보드 조립. list[tuple[str, markup|None]] 반환."""
    kst = timezone(timedelta(hours=9))
    today = datetime.now(kst).date()
    tomorrow = today + timedelta(days=1)
    today_str = today.isoformat()
    tomorrow_str = tomorrow.isoformat()

    today_pending = await notion_service.get_todos_by_date(today_str)
    today_done = await notion_service.get_todos_done_today()
    tomorrow_todos = await notion_service.get_todos_by_date(tomorrow_str)

    pending_with_keys = []
    for todo in today_pending:
        short_key = uuid4().hex[:8]
        await redis.set(KEY_INBOX_CB.format(short_key=short_key), todo["page_id"], ex=86400)
        pending_with_keys.append({
            "text": todo["text"],
            "page_id": todo["page_id"],
            "short_key": short_key
        })

    count_str = await redis.get(_k(KEY_QUIZ_COUNT, chat_id))
    quiz_count = int(count_str) if count_str else 0

    messages = []  # list of (text, markup)

    if hour == 22:
        # 22시: 단일 마무리 메시지
        text_parts = ["📋 오늘 마무리"]
        if pending_with_keys or today_done:
            for item in pending_with_keys:
                text_parts.append(f"• {item['text']}")
            for item in today_done:
                text_parts.append(f"~~{item['text']}~~ ✔")
        else:
            text_parts.append("오늘 마무리할 일 없음")

        if tomorrow_todos:
            text_parts.append("")
            text_parts.append("📅 내일 예정")
            for item in tomorrow_todos:
                text_parts.append(f"• {item['text']}")

        if quiz_count > 0:
            text_parts.append("")
            text_parts.append(f"🔤 퀴즈 {quiz_count}개 남음")
        else:
            text_parts.append("")
            text_parts.append("🔤 퀴즈 ✔ 완료")

        if not pending_with_keys and not today_done and not tomorrow_todos and quiz_count == 0:
            return []

        buttons = []
        for item in pending_with_keys:
            buttons.append([
                InlineKeyboardButton("✔ 완료", callback_data=f"inbox:done:{item['short_key']}"),
                InlineKeyboardButton("연기▶", callback_data=f"inbox:postpone:{item['short_key']}")
            ])
        if quiz_count > 0:
            buttons.append([InlineKeyboardButton("시작", callback_data="quiz:start")])
        markup = InlineKeyboardMarkup(buttons) if buttons else None
        messages.append(("\n".join(text_parts), markup))

    else:  # 09시 또는 15시
        has_todos = bool(pending_with_keys or today_done or tomorrow_todos)
        if not has_todos and quiz_count == 0:
            return []

        # 미완료 할일 → 항목별 개별 메시지
        for item in pending_with_keys:
            markup = InlineKeyboardMarkup([[
                InlineKeyboardButton("✔ 완료", callback_data=f"inbox:done:{item['short_key']}"),
                InlineKeyboardButton("연기▶", callback_data=f"inbox:postpone:{item['short_key']}")
            ]])
            messages.append((f"📋 {item['text']}", markup))

        # 완료된 항목 (버튼 없음)
        for item in today_done:
            messages.append((f"✔ ~~{item['text']}~~", None))

        # 오늘 할일 없으면 내일 예정 단일 메시지
        if not pending_with_keys and not today_done and tomorrow_todos:
            text_parts = ["📅 내일 예정"]
            for item in tomorrow_todos:
                text_parts.append(f"• {item['text']}")
            messages.append(("\n".join(text_parts), None))

        # 퀴즈 → 별도 메시지
        if quiz_count > 0:
            quiz_markup = InlineKeyboardMarkup([[InlineKeyboardButton("시작", callback_data="quiz:start")]])
            messages.append((f"🔤 퀴즈 {quiz_count}개 남음", quiz_markup))

    return messages
