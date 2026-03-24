"""url_handler._get_platform 단위 테스트 — 외부 의존 없음."""
import logging
import sys
import types
import unittest
from unittest.mock import MagicMock

# config.settings mock
_mock_settings = MagicMock()
sys.modules.setdefault("config", types.ModuleType("config"))
sys.modules["config"].settings = _mock_settings  # type: ignore

# telegram, services mock (핸들러 import 시 필요)
for mod in [
    "telegram", "telegram.ext",
    "services.webpage_service", "services.github_service",
    "services.ai_service", "services.notion_service",
]:
    sys.modules.setdefault(mod, MagicMock())

import importlib
import handlers.url_handler as url_mod
importlib.reload(url_mod)

from handlers.url_handler import _get_platform

logger = logging.getLogger(__name__)


class TestGetPlatform(unittest.TestCase):

    def test_github_url(self):
        result = _get_platform("https://github.com/user/repo")
        logger.info(f"github URL → platform: {result}")
        self.assertEqual(result, "github")

    def test_youtube_watch_url(self):
        result = _get_platform("https://www.youtube.com/watch?v=abc123")
        logger.info(f"youtube watch URL → platform: {result}")
        self.assertEqual(result, "youtube")

    def test_youtu_be_short_url(self):
        result = _get_platform("https://youtu.be/abc123")
        logger.info(f"youtu.be URL → platform: {result}")
        self.assertEqual(result, "youtube")

    def test_youtube_shorts_url(self):
        result = _get_platform("https://www.youtube.com/shorts/abc123")
        logger.info(f"youtube shorts URL → platform: {result}")
        self.assertEqual(result, "shorts")

    def test_general_web_url(self):
        result = _get_platform("https://news.ycombinator.com/item?id=123")
        logger.info(f"일반 웹 URL → platform: {result}")
        self.assertEqual(result, "web")

    def test_blog_url(self):
        result = _get_platform("https://medium.com/@user/some-article")
        logger.info(f"블로그 URL → platform: {result}")
        self.assertEqual(result, "web")

    def test_github_issue_url(self):
        result = _get_platform("https://github.com/user/repo/issues/1")
        logger.info(f"github issue URL → platform: {result}")
        self.assertEqual(result, "github")


if __name__ == "__main__":
    unittest.main(verbosity=2)
