"""ai_service._parse_response 단위 테스트 — 외부 API 호출 없음."""
import logging
import sys
import types
import unittest
from unittest.mock import MagicMock

# config.settings mock
_mock_settings = MagicMock()
_mock_settings.GEMINI_API_KEY = "fake-gemini-key"
_mock_settings.ANTHROPIC_API_KEY = "fake-anthropic-key"
_mock_settings.AI_PROVIDER = "gemini"
sys.modules.setdefault("config", types.ModuleType("config"))
sys.modules["config"].settings = _mock_settings  # type: ignore

# google.genai, anthropic mock
sys.modules.setdefault("google", MagicMock())
sys.modules.setdefault("google.genai", MagicMock())
sys.modules.setdefault("google.genai.types", MagicMock())
sys.modules.setdefault("anthropic", MagicMock())

import importlib
import services.ai_service as ai_mod
importlib.reload(ai_mod)

from services.ai_service import _parse_response

logger = logging.getLogger(__name__)


class TestParseResponse(unittest.TestCase):

    def test_standard_title(self):
        text = "제목: 파이썬 비동기 프로그래밍 가이드\n  - 내용1\n  - 내용2"
        result = _parse_response(text)
        logger.info(f"표준 제목 파싱 → title: '{result['title']}'")
        self.assertEqual(result["title"], "파이썬 비동기 프로그래밍 가이드")
        self.assertEqual(result["summary"], text)

    def test_title_with_bold_asterisk(self):
        text = "**제목:** 마크다운 굵게 제목\n  - 내용"
        result = _parse_response(text)
        logger.info(f"굵게 제목 파싱 → title: '{result['title']}'")
        self.assertEqual(result["title"], "마크다운 굵게 제목")

    def test_title_with_single_asterisk(self):
        text = "*제목:* 별표 하나 제목\n  - 내용"
        result = _parse_response(text)
        logger.info(f"별표 제목 파싱 → title: '{result['title']}'")
        self.assertEqual(result["title"], "별표 하나 제목")

    def test_no_title(self):
        text = "그냥 요약 텍스트입니다.\n아무것도 없음."
        result = _parse_response(text)
        logger.info(f"제목 없는 응답 파싱 → title: '{result['title']}'")
        self.assertEqual(result["title"], "")

    def test_title_with_leading_whitespace(self):
        text = "제목:   앞에 공백 있는 제목\n  - 내용"
        result = _parse_response(text)
        logger.info(f"공백 포함 제목 파싱 → title: '{result['title']}'")
        self.assertEqual(result["title"], "앞에 공백 있는 제목")

    def test_summary_is_full_text(self):
        text = "제목: 테스트\n  - 항목1\n  - 항목2\n  - 결론"
        result = _parse_response(text)
        logger.info(f"summary 전체 텍스트 보존 여부 확인 → 길이: {len(result['summary'])}")
        self.assertEqual(result["summary"], text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
