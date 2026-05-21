import os
import sys
import unittest
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _prop_title(text):
    return {"title": [{"plain_text": text}]}


def _prop_rich(text):
    return {"rich_text": [{"plain_text": text}]}


def _prop_select(name):
    return {"select": {"name": name}}


def _schedule_page(**overrides):
    props = {
        "이름": _prop_title("커튼 열기"),
        "시간": {"date": {"start": "2026-05-21T07:00:00+09:00"}},
        "반복": _prop_select("매일"),
        "메시지": _prop_rich("물 마시고 창문 열기"),
        "확인": {"checkbox": False},
        "분류": _prop_select("수면"),
        "상태": _prop_select("대기"),
    }
    props.update(overrides)
    return {"id": "page-1", "properties": props}


class TestScheduleReminderService(unittest.TestCase):
    def test_parse_schedule_page_extracts_reminder(self):
        from services.schedule_reminder_service import parse_schedule_page

        reminder = parse_schedule_page(_schedule_page())

        self.assertEqual(reminder.page_id, "page-1")
        self.assertEqual(reminder.name, "커튼 열기")
        self.assertEqual(reminder.when.hour, 7)
        self.assertEqual(reminder.when.minute, 0)
        self.assertEqual(reminder.repeat, "매일")
        self.assertEqual(reminder.message, "물 마시고 창문 열기")
        self.assertEqual(reminder.category, "수면")

    def test_parse_schedule_page_skips_checked_item(self):
        from services.schedule_reminder_service import parse_schedule_page

        reminder = parse_schedule_page(_schedule_page(**{"확인": {"checkbox": True}}))

        self.assertIsNone(reminder)

    def test_parse_schedule_page_skips_empty_time(self):
        from services.schedule_reminder_service import parse_schedule_page

        reminder = parse_schedule_page(_schedule_page(**{"시간": {"date": None}}))

        self.assertIsNone(reminder)

    def test_should_register_one_off_only_when_future(self):
        from services.schedule_reminder_service import parse_schedule_page, should_register

        reminder = parse_schedule_page(_schedule_page(**{"반복": _prop_select("")}))
        now = datetime(2026, 5, 21, 8, 0, tzinfo=timezone(timedelta(hours=9)))

        self.assertFalse(should_register(reminder, now=now))

    def test_format_reminder_includes_time_message_and_category(self):
        from services.schedule_reminder_service import format_reminder, parse_schedule_page

        reminder = parse_schedule_page(_schedule_page())

        self.assertEqual(format_reminder(reminder), "⏰ 07:00 커튼 열기\n물 마시고 창문 열기\n#수면")


if __name__ == "__main__":
    unittest.main()
