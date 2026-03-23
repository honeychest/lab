"""github_service 단위 테스트 — 실제 HTTP 요청 없이 requests를 mock."""
import base64
import json
import sys
import types
import unittest
from unittest.mock import MagicMock, patch, AsyncMock


# config.settings mock — 실제 .env 없이 테스트 가능하도록
_mock_settings = MagicMock()
_mock_settings.GITHUB_TOKEN = ""
sys.modules.setdefault("config", types.ModuleType("config"))
sys.modules["config"].settings = _mock_settings  # type: ignore

import importlib
import services.github_service as gh_mod
importlib.reload(gh_mod)

from services.github_service import get_repo_info, _parse_github_url


def _make_response(status: int, body: dict | None = None, headers: dict | None = None):
    resp = MagicMock()
    resp.status_code = status
    resp.headers = headers or {}
    resp.json.return_value = body or {}
    resp.raise_for_status = MagicMock()
    if status >= 400:
        import requests
        resp.raise_for_status.side_effect = requests.HTTPError(response=resp)
    return resp


def _readme_response(text: str):
    encoded = base64.b64encode(text.encode()).decode() + "\n"
    return _make_response(200, {"content": encoded})


class TestParseGithubUrl(unittest.TestCase):

    def test_standard_url(self):
        result = _parse_github_url("https://github.com/user/repo")
        self.assertEqual(result, ("user", "repo"))

    def test_url_with_tree_path(self):
        result = _parse_github_url("https://github.com/user/repo/tree/main/docs")
        self.assertEqual(result, ("user", "repo"))

    def test_url_with_git_suffix(self):
        result = _parse_github_url("https://github.com/user/repo.git")
        self.assertEqual(result, ("user", "repo"))

    def test_url_without_scheme(self):
        result = _parse_github_url("github.com/user/repo")
        self.assertEqual(result, ("user", "repo"))

    def test_non_github_url(self):
        result = _parse_github_url("https://gitlab.com/user/repo")
        self.assertIsNone(result)


class TestGetRepoInfo(unittest.IsolatedAsyncioTestCase):

    @patch("services.github_service.requests.get")
    async def test_success_with_readme(self, mock_get):
        meta = _make_response(200, {
            "full_name": "user/repo",
            "description": "Test repo",
            "stargazers_count": 100,
            "language": "Python",
            "license": {"spdx_id": "MIT"},
            "topics": ["ai", "python"],
        })
        readme = _readme_response("# MyRepo\n\n## Install\npip install myrepo\n")

        mock_get.side_effect = [meta, readme]

        with patch("services.github_service.asyncio.get_running_loop") as mock_loop:
            loop = MagicMock()
            mock_loop.return_value = loop

            async def fake_run_in_executor(_, fn):
                return fn()

            loop.run_in_executor = fake_run_in_executor

            import asyncio
            with patch("services.github_service.asyncio.gather", new=AsyncMock(return_value=(meta, readme))):
                result = await get_repo_info("https://github.com/user/repo")

        self.assertEqual(result["name"], "user/repo")
        self.assertEqual(result["stars"], 100)
        self.assertEqual(result["language"], "Python")
        self.assertEqual(result["license"], "MIT")
        self.assertTrue(result["has_readme"])
        self.assertIn("MyRepo", result["readme"])

    @patch("services.github_service.asyncio.gather", new_callable=AsyncMock)
    async def test_success_no_readme(self, mock_gather):
        meta = _make_response(200, {
            "full_name": "user/repo",
            "description": "No readme repo",
            "stargazers_count": 5,
            "language": "Go",
            "license": None,
            "topics": [],
        })
        readme = _make_response(404)
        mock_gather.return_value = (meta, readme)

        result = await get_repo_info("https://github.com/user/repo")
        self.assertFalse(result["has_readme"])
        self.assertEqual(result["readme"], "")
        self.assertEqual(result["license"], "Unknown")

    @patch("services.github_service.asyncio.gather", new_callable=AsyncMock)
    async def test_404_raises(self, mock_gather):
        meta = _make_response(404)
        readme = _make_response(404)
        mock_gather.return_value = (meta, readme)

        import requests
        with self.assertRaises(requests.HTTPError) as ctx:
            await get_repo_info("https://github.com/user/nonexistent")
        self.assertIn("404", str(ctx.exception))

    @patch("services.github_service.asyncio.gather", new_callable=AsyncMock)
    async def test_rate_limit_raises(self, mock_gather):
        import time
        reset_ts = str(int(time.time()) + 600)
        meta = _make_response(403, headers={"X-RateLimit-Reset": reset_ts})
        readme = _make_response(404)
        mock_gather.return_value = (meta, readme)

        import requests
        with self.assertRaises(requests.HTTPError) as ctx:
            await get_repo_info("https://github.com/user/repo")
        self.assertIn("rate_limit:", str(ctx.exception))

    @patch("services.github_service.asyncio.gather", new_callable=AsyncMock)
    async def test_invalid_url_raises(self, mock_gather):
        with self.assertRaises(ValueError):
            await get_repo_info("https://gitlab.com/user/repo")
        mock_gather.assert_not_called()


if __name__ == "__main__":
    unittest.main()
