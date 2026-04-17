from datetime import datetime, timedelta

import redis.asyncio as aioredis

from config import settings

redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

DAILY_QUIZ_LIMIT = 20

# ─── 키 상수 ──────────────────────────────────────────────────────────────────
KEY_QUIZ_SESSION    = "nexus:quiz:session:{chat_id}"
KEY_QUIZ_STATE      = "nexus:quiz:state:{chat_id}"
KEY_QUIZ_COUNT      = "nexus:quiz:count:{chat_id}"
KEY_WORD_PENDING    = "nexus:word:pending:{chat_id}"
KEY_QUIZ_PAUSE      = "nexus:quiz:pause:{chat_id}"
KEY_GRAMMAR_PENDING = "nexus:grammar:pending:{chat_id}"
KEY_QUIZ_PREFETCH   = "nexus:quiz:prefetch:{chat_id}"
KEY_LAW_STATE       = "nexus:law:state:{chat_id}"

# ─── 신규 키 ──────────────────────────────────────────────────────────────────
KEY_INBOX_PENDING   = "nexus:inbox:pending:{chat_id}"    # TTL 600s
KEY_SCHEDULE_MSG_ID = "nexus:schedule:msg_id:{chat_id}"  # TTL 없음, 덮어쓰기
KEY_INBOX_CB        = "nexus:inbox:cb:{short_key}"       # TTL 86400s


def _k(key: str, chat_id: int) -> str:
    return key.format(chat_id=chat_id)


def _seconds_until_midnight() -> int:
    now = datetime.now()
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return int((midnight - now).total_seconds())
