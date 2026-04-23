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
    dlog("overdue_pending 추가 조회 — 날짜 지난 미완료 항목")
    overdue_pending = await notion_service.get_todos_overdue(today_str)
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

    dlog("overdue_pending 순회 후 pending_with_keys에 합산 — today_pending 뒤에 추가")
    for todo in overdue_pending:
        short_key = uuid4().hex[:8]
        await redis.set(KEY_INBOX_CB.format(short_key=short_key), todo["page_id"], ex=86400)
        pending_with_keys.append({
            "text": todo["text"],
            "page_id": todo["page_id"],
            "short_key": short_key
        })
    count_str = await redis.get(_k(KEY_QUIZ_COUNT, chat_id))
    quiz_count = int(count_str) if count_str else 0
    dlog("quiz_count > 0이면 due words 존재 여부 추가 확인")
    if quiz_count > 0:
        due_words = await notion_service.get_words_due()
        dlog("due words 없으면 quiz_count 0으로 보정 — 퀴즈 버튼 미노출")
        if not due_words:
            quiz_count = 0

    messages = []  # list of (text, markup)

    if hour == 22:
        # 22시: 개별 메시지 구조
        dlog("콘텐츠 없으면 return []")
        if not pending_with_keys and not today_done and not tomorrow_todos and quiz_count == 0:
            return []

        dlog("헤더 메시지 — 완료 항목 포함, 내일 예정 포함, 버튼 없음")
        header_parts = ["📋 오늘 마무리"]
        for item in today_done:
            header_parts.append(f"~~{item['text']}~~ ✔")
        if not pending_with_keys and not today_done:
            header_parts.append("오늘 마무리할 일 없음")
        if tomorrow_todos:
            header_parts.append("")
            header_parts.append("📅 내일 예정")
            for item in tomorrow_todos:
                header_parts.append(f"• {item['text']}")
        messages.append(("\n".join(header_parts), None))

        dlog("pending_with_keys 순회 — 개별 메시지 + [완료][연기] 버튼")
        for item in pending_with_keys:
            markup = InlineKeyboardMarkup([[
                InlineKeyboardButton("✔ 완료", callback_data=f"inbox:done:{item['short_key']}"),
                InlineKeyboardButton("연기▶", callback_data=f"inbox:postpone:{item['short_key']}")
            ]])
            messages.append((f"📋 {item['text']}", markup))

        dlog("quiz_count > 0 이면 퀴즈 메시지 마지막 추가 — [시작] 버튼")
        if quiz_count > 0:
            quiz_markup = InlineKeyboardMarkup([[InlineKeyboardButton("시작", callback_data="quiz:start")]])
            messages.append((f"🔤 퀴즈 {quiz_count}개 남음", quiz_markup))
        else:
            messages.append(("🔤 퀴즈 ✔ 완료", None))

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
