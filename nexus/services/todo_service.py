import logging
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from chs import dlog
from redis_client import redis, _k, KEY_QUIZ_COUNT, KEY_INBOX_CB
from services import notion_service

logger = logging.getLogger(__name__)


async def build_schedule_content(chat_id: int, hour: int) -> tuple:
    """스케줄 메시지 본문·키보드 조립."""
    # KST 기준 날짜 계산
    kst = timezone(timedelta(hours=9))
    today = datetime.now(kst).date()
    tomorrow = today + timedelta(days=1)
    today_str = today.isoformat()
    tomorrow_str = tomorrow.isoformat()

    # Notion에서 할일 조회
    today_pending = await notion_service.get_todos_by_date(today_str)
    today_done = await notion_service.get_todos_done_today()
    tomorrow_todos = await notion_service.get_todos_by_date(tomorrow_str)

    # 미완료 항목에 short_key 발급 및 Redis 저장
    pending_with_keys = []
    for todo in today_pending:
        short_key = uuid4().hex[:8]
        await redis.set(KEY_INBOX_CB.format(short_key=short_key), todo["page_id"], ex=86400)
        pending_with_keys.append({
            "text": todo["text"],
            "page_id": todo["page_id"],
            "short_key": short_key
        })

    # 퀴즈 잔여 조회
    count_str = await redis.get(_k(KEY_QUIZ_COUNT, chat_id))
    quiz_count = int(count_str) if count_str else 0

    # 텍스트 조립
    text_parts = []

    if hour == 22:
        # 22시: 오늘 마무리 섹션 항상 포함
        text_parts.append("📋 오늘 마무리")
        if pending_with_keys or today_done:
            for item in pending_with_keys:
                text_parts.append(f"• {item['text']}")
            for item in today_done:
                text_parts.append(f"~~{item['text']}~~ ✔")
        else:
            text_parts.append("오늘 마무리할 일 없음")

        # 내일 예정 섹션
        if tomorrow_todos:
            text_parts.append("")
            text_parts.append("📅 내일 예정")
            for item in tomorrow_todos:
                text_parts.append(f"• {item['text']}")

        # 퀴즈 섹션
        if quiz_count > 0:
            text_parts.append("")
            text_parts.append(f"🔤 퀴즈 {quiz_count}개 남음")
        else:
            text_parts.append("")
            text_parts.append("🔤 퀴즈 ✔ 완료")

        # B+D 로직: 오늘+내일 다 없고 퀴즈도 없으면 스킵
        if not pending_with_keys and not today_done and not tomorrow_todos and quiz_count == 0:
            return "", None

    else:  # 09시 또는 15시
        if pending_with_keys or today_done:
            # 오늘 항목 있음
            text_parts.append("📋 오늘 할 일")
            for item in pending_with_keys:
                text_parts.append(f"• {item['text']}")
            for item in today_done:
                text_parts.append(f"~~{item['text']}~~ ✔")
        elif tomorrow_todos:
            # 오늘 없음, 내일 있음
            text_parts.append("📅 내일 예정")
            for item in tomorrow_todos:
                text_parts.append(f"• {item['text']}")
        elif quiz_count > 0:
            # 할일 없음, 퀴즈만 있음
            text_parts.append(f"🔤 퀴즈 {quiz_count}개 남음")
        else:
            # 모두 없음
            return "", None

        # 퀴즈 섹션 추가 (할일 있든 없든)
        if quiz_count > 0:
            if pending_with_keys or today_done or tomorrow_todos:
                text_parts.append("")
            text_parts.append(f"🔤 퀴즈 {quiz_count}개 남음")

    text = "\n".join(text_parts)

    # 키보드 조립
    buttons = []
    for item in pending_with_keys:
        row = [
            InlineKeyboardButton("✔ 완료", callback_data=f"inbox:done:{item['short_key']}"),
            InlineKeyboardButton("연기▶", callback_data=f"inbox:postpone:{item['short_key']}")
        ]
        buttons.append(row)

    # 09시에만 [시작] 버튼 추가
    if hour == 9 and quiz_count > 0:
        buttons.append([InlineKeyboardButton("시작", callback_data="quiz:start")])

    markup = InlineKeyboardMarkup(buttons) if buttons else None

    return text, markup
