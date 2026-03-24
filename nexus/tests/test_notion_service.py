"""notion_service 단위 테스트 — Notion API mock 사용."""
import logging
import sys
import types
import unittest
from unittest.mock import MagicMock, AsyncMock, patch

# config.settings mock
_mock_settings = MagicMock()
_mock_settings.NOTION_API_KEY = "fake-notion-key"
_mock_settings.NOTION_DATABASE_ID = "fake-db-id"
sys.modules.setdefault("config", types.ModuleType("config"))
sys.modules["config"].settings = _mock_settings  # type: ignore

# notion_client mock (모듈 로드 시 AsyncClient 생성 방지)
_mock_notion_module = MagicMock()
sys.modules["notion_client"] = _mock_notion_module

import importlib
import services.notion_service as notion_mod
importlib.reload(notion_mod)

from services.notion_service import exists, save, delete_page

logger = logging.getLogger(__name__)


class TestExists(unittest.IsolatedAsyncioTestCase):

    async def test_url_exists_returns_page_id(self):
        page_id = "abc-123-def"
        notion_mod.client.databases.query = AsyncMock(return_value={
            "results": [{"id": page_id}]
        })

        result = await exists("https://github.com/user/repo")
        logger.info(f"URL 존재 시 → page_id: {result}")
        self.assertEqual(result, page_id)

    async def test_url_not_exists_returns_none(self):
        notion_mod.client.databases.query = AsyncMock(return_value={
            "results": []
        })

        result = await exists("https://github.com/user/new-repo")
        logger.info(f"URL 없을 시 → {result}")
        self.assertIsNone(result)

    async def test_api_error_returns_none(self):
        notion_mod.client.databases.query = AsyncMock(side_effect=Exception("API 오류"))

        result = await exists("https://github.com/user/repo")
        logger.info(f"API 오류 시 → {result} (None 이어야 함)")
        self.assertIsNone(result)


class TestSave(unittest.IsolatedAsyncioTestCase):

    async def test_save_returns_page_id(self):
        page_id = "saved-page-id"
        notion_mod.client.pages.create = AsyncMock(return_value={"id": page_id})

        result = await save("https://example.com", "테스트 제목", "요약 내용", "web")
        logger.info(f"저장 결과 → page_id: {result}")
        self.assertEqual(result, page_id)

    async def test_save_calls_with_correct_url(self):
        notion_mod.client.pages.create = AsyncMock(return_value={"id": "some-id"})

        url = "https://github.com/user/repo"
        await save(url, "제목", "요약", "github")

        call_kwargs = notion_mod.client.pages.create.call_args.kwargs
        saved_url = call_kwargs["properties"]["원본"]["url"]
        logger.info(f"저장된 URL 확인 → {saved_url}")
        self.assertEqual(saved_url, url)

    async def test_save_calls_with_correct_platform(self):
        notion_mod.client.pages.create = AsyncMock(return_value={"id": "some-id"})

        await save("https://example.com", "제목", "요약", "youtube")

        call_kwargs = notion_mod.client.pages.create.call_args.kwargs
        platform = call_kwargs["properties"]["플랫폼"]["select"]["name"]
        logger.info(f"저장된 플랫폼 확인 → {platform}")
        self.assertEqual(platform, "youtube")


class TestDeletePage(unittest.IsolatedAsyncioTestCase):

    async def test_delete_calls_update_with_archived(self):
        notion_mod.client.pages.update = AsyncMock(return_value={})

        page_id = "target-page-id"
        await delete_page(page_id)

        call_kwargs = notion_mod.client.pages.update.call_args.kwargs
        logger.info(f"삭제 호출 확인 → page_id: {call_kwargs['page_id']}, archived: {call_kwargs['archived']}")
        self.assertEqual(call_kwargs["page_id"], page_id)
        self.assertTrue(call_kwargs["archived"])

    async def test_delete_api_error_does_not_raise(self):
        notion_mod.client.pages.update = AsyncMock(side_effect=Exception("삭제 실패"))

        try:
            await delete_page("some-page-id")
            logger.info("삭제 API 오류 시 예외 미전파 확인 → 정상")
        except Exception:
            self.fail("delete_page가 예외를 전파함")


if __name__ == "__main__":
    unittest.main(verbosity=2)
