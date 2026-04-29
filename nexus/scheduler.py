import json
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from telegram import Bot

from chs import dlog
from redis_client import redis, _k, _seconds_until_midnight, KEY_QUIZ_COUNT, KEY_QUIZ_TOTAL, KEY_SCHEDULE_MSG_ID
from services import todo_service, notion_service

logger = logging.getLogger(__name__)
dlog("redis_client 공통 모듈 + todo_service import")

scheduler = AsyncIOScheduler()
dlog("setup_scheduler의 bot 인자를 add_job args[]로 직접 전달")

SCHEDULE_HOURS = [9, 15, 22]


# [AGENT]
# 09시 스케줄은 due words 개수로 KEY_QUIZ_COUNT와 KEY_QUIZ_TOTAL을 같이 초기화한다.
# 15시/22시 스케줄은 todo_service.build_schedule_content()가 현재 카운트로 메시지를 만든다.


# ─── 통합 스케줄 메시지 발송 ─────────────────────────────────────────────────
async def send_schedule_message(bot: Bot, chat_id: int, hour: int) -> None:
    """통합 스케줄 메시지 발송 — 09/15/22시 공통 진입점."""
    # 이전 스케줄 메시지 버튼 제거
    prev_raw = await redis.get(_k(KEY_SCHEDULE_MSG_ID, chat_id))
    if prev_raw:
        try:
            prev_ids = json.loads(prev_raw)
            for mid in prev_ids:
                try:
                    await bot.edit_message_reply_markup(chat_id, int(mid), reply_markup=None)
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"이전 스케줄 메시지 버튼 제거 실패: {e}")

    # 09시 카운트 초기화
    if hour == 9:
        dlog("get_words_due() 호출하여 실제 due words 개수로 KEY_QUIZ_COUNT set")
        due_words = await notion_service.get_words_due()
        dlog("len(due_words)로 KEY_QUIZ_COUNT set — 0개면 0으로 set")
        dlog("KEY_QUIZ_TOTAL도 len(due_words)로 set — [완료/전체] 표시 기준")
        dlog("KEY_QUIZ_COUNT와 KEY_QUIZ_TOTAL TTL을 둘 다 자정까지 유지")
        quiz_total = len(due_words)
        ttl = _seconds_until_midnight()
        await redis.set(_k(KEY_QUIZ_COUNT, chat_id), quiz_total, ex=ttl)
        await redis.set(_k(KEY_QUIZ_TOTAL, chat_id), quiz_total, ex=ttl)

    # 본문·키보드 조립 (list of (text, markup))
    messages = await todo_service.build_schedule_content(chat_id, hour)

    # 발송 스킵 (내용이 없으면)
    if not messages:
        logger.info(f"스케줄 메시지 스킵 — {hour:02d}:00 (할일/퀴즈 없음)")
        return

    # 메시지 순서대로 발송, 발송된 msg_id 모두 저장
    sent_ids = []
    for text, markup in messages:
        msg = await bot.send_message(chat_id=chat_id, text=text, reply_markup=markup)
        sent_ids.append(str(msg.message_id))
    await redis.set(_k(KEY_SCHEDULE_MSG_ID, chat_id), json.dumps(sent_ids))
    logger.info(f"스케줄 메시지 발송 — {hour:02d}:00, msg_ids: {sent_ids}")


# ─── 스케줄러 등록 (main.py에서 호출) ────────────────────────────────────────
def setup_scheduler(bot: Bot, chat_id: int) -> None:
    """스케줄 등록 후 스케줄러 시작."""
    dlog("SCHEDULE_HOURS 순회 → send_schedule_message APScheduler args[]로 bot 주입")
    for h in SCHEDULE_HOURS:
        scheduler.add_job(
            send_schedule_message,
            trigger=CronTrigger(hour=h, minute=0, timezone="Asia/Seoul"),
            args=[bot, chat_id, h],
            id=f"schedule_{h}",
            replace_existing=True,
        )
        logger.info(f"스케줄 등록 — {h:02d}:00 KST (schedule_{h})")

    scheduler.start()
    logger.info("스케줄러 시작 완료")
