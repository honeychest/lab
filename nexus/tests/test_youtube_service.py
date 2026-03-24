"""youtube_service._extract_video_id 단위 테스트 — 외부 호출 없음."""
import logging
import sys
import types
import unittest
from unittest.mock import MagicMock

# config.settings mock
_mock_settings = MagicMock()
_mock_settings.GROQ_API_KEY = ""
sys.modules.setdefault("config", types.ModuleType("config"))
sys.modules["config"].settings = _mock_settings  # type: ignore

# youtube_transcript_api mock
sys.modules.setdefault("youtube_transcript_api", MagicMock())

import importlib
import services.youtube_service as yt_mod
importlib.reload(yt_mod)

from services.youtube_service import _extract_video_id

logger = logging.getLogger(__name__)


class TestExtractVideoId(unittest.TestCase):

    def test_watch_url(self):
        result = _extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        logger.info(f"watch URL → video_id: {result}")
        self.assertEqual(result, "dQw4w9WgXcQ")

    def test_watch_url_with_extra_params(self):
        result = _extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&list=PL123")
        logger.info(f"파라미터 포함 watch URL → video_id: {result}")
        self.assertEqual(result, "dQw4w9WgXcQ")

    def test_youtu_be_url(self):
        result = _extract_video_id("https://youtu.be/dQw4w9WgXcQ")
        logger.info(f"youtu.be URL → video_id: {result}")
        self.assertEqual(result, "dQw4w9WgXcQ")

    def test_youtu_be_with_query(self):
        result = _extract_video_id("https://youtu.be/dQw4w9WgXcQ?t=30")
        logger.info(f"youtu.be 쿼리 포함 → video_id: {result}")
        self.assertEqual(result, "dQw4w9WgXcQ")

    def test_shorts_url(self):
        result = _extract_video_id("https://www.youtube.com/shorts/abc123xyz")
        logger.info(f"shorts URL → video_id: {result}")
        self.assertEqual(result, "abc123xyz")

    def test_shorts_with_query(self):
        result = _extract_video_id("https://www.youtube.com/shorts/abc123xyz?feature=share")
        logger.info(f"shorts 쿼리 포함 → video_id: {result}")
        self.assertEqual(result, "abc123xyz")

    def test_invalid_url_raises(self):
        with self.assertRaises(ValueError) as ctx:
            _extract_video_id("https://vimeo.com/123456")
        logger.info(f"비유튜브 URL → 예외 발생: {ctx.exception}")

    def test_empty_url_raises(self):
        with self.assertRaises((ValueError, IndexError)):
            _extract_video_id("")
        logger.info("빈 URL → 예외 발생 확인")


if __name__ == "__main__":
    unittest.main(verbosity=2)
