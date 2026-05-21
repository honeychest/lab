import asyncio
import os
import sys
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class TestSchedulerReminders(unittest.TestCase):
    def test_send_schedule_reminder_formats_and_sends_message(self):
        import scheduler
        from services.schedule_reminder_service import ScheduleReminder

        reminder = ScheduleReminder(
            page_id="page-1",
            name="커튼 열기",
            when=datetime(2026, 5, 21, 7, 0, tzinfo=timezone(timedelta(hours=9))),
            repeat="매일",
            message="물 마시기",
            category="수면",
        )
        bot = AsyncMock()

        _run(scheduler.send_schedule_reminder(bot, 12345, reminder))

        bot.send_message.assert_awaited_once_with(
            chat_id=12345,
            text="⏰ 07:00 커튼 열기\n물 마시기\n#수면",
        )

    def test_refresh_schedule_reminders_replaces_routine_jobs(self):
        import scheduler
        from services.schedule_reminder_service import ScheduleReminder

        class FakeJob:
            def __init__(self, job_id):
                self.id = job_id

        class FakeScheduler:
            def __init__(self):
                self.removed = []
                self.added = []

            def get_jobs(self):
                return [FakeJob("routine_old"), FakeJob("schedule_9")]

            def remove_job(self, job_id):
                self.removed.append(job_id)

            def add_job(self, *args, **kwargs):
                self.added.append((args, kwargs))

        fake_scheduler = FakeScheduler()
        reminder = ScheduleReminder(
            page_id="page-1",
            name="커튼 열기",
            when=datetime(2026, 5, 21, 7, 0, tzinfo=timezone(timedelta(hours=9))),
            repeat="매일",
        )

        with patch.object(scheduler, "scheduler", fake_scheduler), \
             patch("scheduler.schedule_reminder_service.load_schedule_reminders", AsyncMock(return_value=[reminder])):
            _run(scheduler.refresh_schedule_reminders(AsyncMock(), 12345))

        self.assertEqual(fake_scheduler.removed, ["routine_old"])
        self.assertEqual(len(fake_scheduler.added), 1)
        self.assertEqual(fake_scheduler.added[0][1]["id"], "routine_page1")


if __name__ == "__main__":
    unittest.main()
