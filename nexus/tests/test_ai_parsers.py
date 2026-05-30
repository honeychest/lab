import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.ai_parsers import (
    parse_response,
    parse_grade_response,
    parse_explain_response,
    has_invalid_content,
    has_invalid_content_stage2,
    force_clean,
)


class TestParseResponse(unittest.TestCase):

    def test_extracts_search_tags_and_hides_tag_line_from_summary(self):
        text = (
            "제목: Claude Code 컨텍스트 관리 Skill\n"
            "- Claude Code에서 컨텍스트 낭비를 줄이는 방법\n"
            "태그: Claude, 클로드, AI에이전트, 컨텍스트 관리, 토큰 절약, 스킬"
        )

        r = parse_response(text)

        self.assertEqual(r["title"], "Claude Code 컨텍스트 관리 Skill")
        self.assertEqual(
            r["tags"],
            ["Claude", "클로드", "AI에이전트", "컨텍스트 관리", "토큰 절약", "스킬"],
        )
        self.assertNotIn("태그:", r["summary"])

    def test_tags_are_limited_and_deduplicated(self):
        text = "제목: 테스트\n태그: Claude, Claude, 클로드, AI, 컨텍스트, 스킬, 자동화, 개발도구"

        r = parse_response(text)

        self.assertEqual(r["tags"], ["Claude", "클로드", "AI", "컨텍스트", "스킬", "자동화"])


class TestParseGradeResponse(unittest.TestCase):

    def test_correct_no_errors(self):
        text = "사용여부: yes\n맥락: no\n오류: 없음\n대안표현: 없음"
        r = parse_grade_response(text)
        self.assertTrue(r["used_correctly"])
        self.assertFalse(r["context_ok"])
        self.assertEqual(r["grammar_errors"], [])
        self.assertEqual(r["collocation_errors"], [])
        self.assertEqual(r["alternatives"], [])

    def test_wrong_answer(self):
        text = "사용여부: no\n맥락: no\n오류: 없음\n대안표현: 없음"
        r = parse_grade_response(text)
        self.assertFalse(r["used_correctly"])

    def test_grammar_error_parsed(self):
        text = "사용여부: yes\n맥락: no\n오류: [관사] a habit → the habit\n대안표현: 없음"
        r = parse_grade_response(text)
        self.assertEqual(len(r["grammar_errors"]), 1)
        self.assertEqual(r["grammar_errors"][0]["type"], "관사")
        self.assertIn("habit", r["grammar_errors"][0]["detail"])

    def test_multiple_grammar_errors(self):
        text = (
            "사용여부: yes\n맥락: no\n"
            "오류: [관사] a effort → an effort\n[시제] he go → he went\n"
            "대안표현: 없음"
        )
        r = parse_grade_response(text)
        self.assertEqual(len(r["grammar_errors"]), 2)
        types = [e["type"] for e in r["grammar_errors"]]
        self.assertIn("관사", types)
        self.assertIn("시제", types)

    def test_collocation_error_extracts_corrected_form(self):
        text = "사용여부: yes\n맥락: no\n오류: [연어] do an effort → make an effort\n대안표현: 없음"
        r = parse_grade_response(text)
        self.assertEqual(r["collocation_errors"], ["make an effort"])
        self.assertEqual(r["grammar_errors"], [])

    def test_alternatives_parsed(self):
        text = "사용여부: yes\n맥락: no\n오류: 없음\n대안표현: keep trying / stay persistent"
        r = parse_grade_response(text)
        self.assertEqual(r["alternatives"], ["keep trying", "stay persistent"])

    def test_no_errors_text_gives_empty_lists(self):
        text = "사용여부: yes\n맥락: yes\n오류: 없음\n대안표현: 없음"
        r = parse_grade_response(text)
        self.assertEqual(r["grammar_errors"], [])
        self.assertEqual(r["collocation_errors"], [])

    def test_missing_fields_do_not_crash(self):
        r = parse_grade_response("아무 내용 없음")
        self.assertFalse(r["used_correctly"])
        self.assertFalse(r["context_ok"])
        self.assertEqual(r["grammar_errors"], [])


class TestParseExplainResponse(unittest.TestCase):

    def test_normal_response(self):
        text = "단어: make an effort\n뜻: (동사구) 노력하다\n예문: You should make an effort."
        r = parse_explain_response(text)
        self.assertEqual(r["word"], "make an effort")
        self.assertIn("노력", r["meaning_ko"])
        self.assertIn("effort", r["example"])

    def test_missing_fields_return_empty_string(self):
        r = parse_explain_response("단어: persevere")
        self.assertEqual(r["word"], "persevere")
        self.assertEqual(r["meaning_ko"], "")
        self.assertEqual(r["example"], "")


class TestHasInvalidContent(unittest.TestCase):

    def test_word_in_text_is_invalid(self):
        self.assertTrue(has_invalid_content("effort is important", "effort"))

    def test_word_absent_is_valid(self):
        self.assertFalse(has_invalid_content("hard work pays off", "effort"))

    def test_markdown_asterisk_is_invalid(self):
        self.assertTrue(has_invalid_content("**bold** text", "effort"))

    def test_empty_parentheses_is_invalid(self):
        self.assertTrue(has_invalid_content("fill in ()", "effort"))

    def test_clean_text_is_valid(self):
        self.assertFalse(has_invalid_content("She works very hard every day.", "effort"))

    def test_case_insensitive(self):
        self.assertTrue(has_invalid_content("She made an Effort", "effort"))


class TestHasInvalidContentStage2(unittest.TestCase):

    def test_blank_present_word_absent_is_valid(self):
        self.assertFalse(has_invalid_content_stage2("She _______ every day.", "work"))

    def test_no_blank_is_invalid(self):
        self.assertTrue(has_invalid_content_stage2("She works every day.", "work"))

    def test_word_present_even_with_blank_is_invalid(self):
        self.assertTrue(has_invalid_content_stage2("She work _______ hard.", "work"))

    def test_markdown_with_blank_is_invalid(self):
        self.assertTrue(has_invalid_content_stage2("She **_______** hard.", "work"))


class TestForceClean(unittest.TestCase):

    def test_stage3_replaces_word_with_blank(self):
        result = force_clean("She made a great effort today.", "effort", stage=3)
        self.assertNotIn("effort", result.lower())
        self.assertIn("___", result)

    def test_stage3_removes_markdown(self):
        result = force_clean("**She** made an effort.", "effort", stage=3)
        self.assertNotIn("*", result)

    def test_stage2_inserts_blank_when_missing(self):
        result = force_clean("She works hard every day.", "work", stage=2)
        self.assertIn("_______", result)
        self.assertNotIn("work", result.lower())

    def test_stage2_keeps_existing_blank(self):
        result = force_clean("She _______ hard every day.", "work", stage=2)
        self.assertIn("_______", result)

    def test_stage2_removes_word_even_when_blank_exists(self):
        result = force_clean("She work _______ hard.", "work", stage=2)
        text_without_blank = result.replace("_______", "")
        self.assertNotIn("work", text_without_blank.lower())


if __name__ == "__main__":
    unittest.main()
