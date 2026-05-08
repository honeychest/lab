import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from telegram import Bot

from chs import dlog
from session import QuizSession, ScheduleTracker
from services import todo_service, notion_service

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

SCHEDULE_HOURS = [9, 15, 22]


# [AGENT]
# 09시 스케줄은 due words 개수로 QuizSession.init_count()를 호출한다.
# 15시/22시 스케줄은 todo_service.build_schedule_content()가 현재 카운트로 메시지를 만든다.


async def send_schedule_message(bot: Bot, chat_id: int, hour: int, *, timeout: float = 10.0) -> None:
    """통합 스케줄 메시지 발송 — 09/15/22시 공통 진입점."""
    tracker = ScheduleTracker(chat_id)

    prev_ids = await tracker.get_message_ids()
    for mid in prev_ids:
        try:
            await bot.edit_message_reply_markup(chat_id, int(mid), reply_markup=None)
        except Exception:
            pass

    if hour == 9:
        due_words = await notion_service.get_words_due()
        await QuizSession(chat_id).init_count(len(due_words))

    try:
        messages = await asyncio.wait_for(
            todo_service.build_schedule_content(chat_id, hour),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.warning(f"스케줄 메시지 타임아웃 — {hour:02d}:00 ({timeout}s 초과)")
        return

    if not messages:
        logger.info(f"스케줄 메시지 스킵 — {hour:02d}:00 (할일/퀴즈 없음)")
        return

    sent_ids = []
    for text, markup in messages:
        msg = await bot.send_message(chat_id=chat_id, text=text, reply_markup=markup)
        sent_ids.append(str(msg.message_id))

    await tracker.set_message_ids(sent_ids)
    logger.info(f"스케줄 메시지 발송 — {hour:02d}:00, msg_ids: {sent_ids}")


def setup_scheduler(bot: Bot, chat_id: int) -> None:
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
