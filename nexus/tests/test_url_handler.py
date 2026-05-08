import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from handlers.url_handler import _github_error_reply, _get_platform


class TestGithubErrorReply(unittest.TestCase):

    def test_404_returns_not_found_message(self):
        reply = _github_error_reply("404 Not Found")
        self.assertIn("찾을 수 없", reply)

    def test_rate_limit_includes_minutes(self):
        reply = _github_error_reply("rate_limit:120")
        self.assertIn("2분", reply)

    def test_rate_limit_rounds_up_to_one_minute(self):
        reply = _github_error_reply("rate_limit:30")
        self.assertIn("1분", reply)

    def test_unknown_error_returns_generic_message(self):
        reply = _github_error_reply("500 Internal Server Error")
        self.assertIn("GitHub API 오류", reply)


class TestGetPlatform(unittest.TestCase):

    def test_github(self):
        self.assertEqual(_get_platform("https://github.com/user/repo"), "github")

    def test_youtube_watch(self):
        self.assertEqual(_get_platform("https://youtube.com/watch?v=abc"), "youtube")

    def test_shorts(self):
        self.assertEqual(_get_platform("https://youtube.com/shorts/abc"), "shorts")

    def test_reddit(self):
        self.assertEqual(_get_platform("https://reddit.com/r/python"), "reddit")

    def test_generic_web(self):
        self.assertEqual(_get_platform("https://example.com"), "web")


if __name__ == "__main__":
    unittest.main()
