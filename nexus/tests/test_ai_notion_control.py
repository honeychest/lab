import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestAiNotionControl(unittest.TestCase):
    def test_build_properties_supports_schedule_types(self):
        from services.ai_notion_control import build_properties

        props = build_properties({
            "이름": {"type": "title", "value": "커튼 열기"},
            "시간": {"type": "date", "value": "2026-05-21T07:00:00+09:00"},
            "반복": {"type": "select", "value": "매일"},
            "메시지": {"type": "rich_text", "value": "물 마시기"},
            "확인": {"type": "checkbox", "value": False},
        })

        self.assertEqual(props["이름"]["title"][0]["text"]["content"], "커튼 열기")
        self.assertEqual(props["시간"]["date"]["start"], "2026-05-21T07:00:00+09:00")
        self.assertEqual(props["반복"]["select"]["name"], "매일")
        self.assertEqual(props["메시지"]["rich_text"][0]["text"]["content"], "물 마시기")
        self.assertFalse(props["확인"]["checkbox"])

    def test_recovery_schedule_specs_are_upsertable_by_name(self):
        from services.ai_notion_control import recovery_schedule_specs

        specs = recovery_schedule_specs("2026-05-21")
        names = [spec["이름"]["value"] for spec in specs]

        self.assertIn("커튼 열기 / 물 마시기", names)
        self.assertIn("침대 들어가기", names)
        self.assertTrue(all(spec["반복"]["value"] == "매일" for spec in specs))


if __name__ == "__main__":
    unittest.main()
