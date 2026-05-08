import asyncio
import logging
from datetime import datetime, timezone, timedelta

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from redis_client import redis, _k, KEY_QUIZ_COUNT
from services import notion_service
from services.inbox_action_token import create_inbox_action_token
from services.schedule_plan import ScheduleInputs, build_schedule_plan

logger = logging.getLogger(__name__)


# [AGENT]
# 09/15/22시 스케줄 본문을 만든다.
# 15시는 자동퀴즈 카운트가 0이어도 "오늘 복습할 단어가 없어요" 메시지를 보낸다.


async def build_schedule_content(chat_id: int, hour: int) -> list:
    """스케줄 메시지 본문·키보드 조립. list[tuple[str, markup|None]] 반환."""
    kst = timezone(timedelta(hours=9))
    today = datetime.now(kst).date()
    tomorrow = today + timedelta(days=1)
    today_str = today.isoformat()
    tomorrow_str = tomorrow.isoformat()

    today_pending, overdue_pending, today_done, tomorrow_todos = await asyncio.gather(
        notion_service.get_todos(date=today_str),
        notion_service.get_todos(overdue_before=today_str),
        notion_service.get_todos(done_on=today_str),
        notion_service.get_todos(date=tomorrow_str),
    )

    pending_with_keys = await _attach_inbox_action_keys([*today_pending, *overdue_pending])
    count_str = await redis.get(_k(KEY_QUIZ_COUNT, chat_id))
    quiz_count = int(count_str) if count_str else 0
    if quiz_count > 0:
        due_words = await notion_service.get_words_due()
        if not due_words:
            quiz_count = 0

    plan = build_schedule_plan(ScheduleInputs(
        hour=hour,
        today=today,
        pending=pending_with_keys,
        done=today_done,
        tomorrow=tomorrow_todos,
        quiz_count=quiz_count,
    ))
    return [(message.text, _markup_for_action(message.action)) for message in plan]


def _markup_for_action(action: dict | None):
    if not action:
        return None
    if action["kind"] == "inbox_item":
        return InlineKeyboardMarkup([[
            InlineKeyboardButton("✔ 완료", callback_data=action["done_callback"]),
            InlineKeyboardButton("연기▶", callback_data=action["postpone_callback"]),
        ]])
    if action["kind"] == "quiz_start":
        return InlineKeyboardMarkup([[InlineKeyboardButton("시작", callback_data="quiz:start")]])
    return None


async def _attach_inbox_action_keys(todos: list[dict]) -> list[dict]:
    tokens = create_inbox_action_token()
    pending_with_keys = []
    for todo in todos:
        actions = await tokens.create_item_actions(todo["page_id"])
        pending_with_keys.append({
            "text": todo["text"],
            "page_id": todo["page_id"],
            "short_key": actions.short_key,
            "done_callback": actions.done_callback,
            "postpone_callback": actions.postpone_callback,
        })
    return pending_with_keys
