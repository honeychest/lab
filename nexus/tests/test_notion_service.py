"""notion_service 단위 테스트 — Notion API mock 사용."""
import logging
import sys
import types
import unittest
from unittest.mock import MagicMock, AsyncMock, patch

# config.settings mock
_mock_settings = MagicMock()
_mock_settings.NOTION_API_KEY = "fake-notion-key"
_mock_settings.NOTION_LINK_DATABASE_ID = "fake-db-id"
sys.modules.setdefault("config", types.ModuleType("config"))
sys.modules["config"].settings = _mock_settings  # type: ignore

# notion_client mock (모듈 로드 시 AsyncClient 생성 방지)
_mock_notion_module = MagicMock()
sys.modules["notion_client"] = _mock_notion_module

import importlib
import services.notion_service as notion_mod
importlib.reload(notion_mod)

from services.notion_service import exists, save, delete_page, add_word, get_words_due, update_word_stage, exists_word

logger = logging.getLogger(__name__)


class TestExists(unittest.IsolatedAsyncioTestCase):

    async def test_url_exists_returns_page_id(self):
        page_id = "abc-123-def"
        notion_mod.client.data_sources.query = AsyncMock(return_value={
            "results": [{"id": page_id}]
        })

        result = await exists("https://github.com/user/repo")
        logger.info(f"URL 존재 시 → page_id: {result}")
        self.assertEqual(result, page_id)

    async def test_url_not_exists_returns_none(self):
        notion_mod.client.data_sources.query = AsyncMock(return_value={
            "results": []
        })

        result = await exists("https://github.com/user/new-repo")
        logger.info(f"URL 없을 시 → {result}")
        self.assertIsNone(result)

    async def test_api_error_returns_none(self):
        notion_mod.client.data_sources.query = AsyncMock(side_effect=Exception("API 오류"))

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


class TestExistsWord(unittest.IsolatedAsyncioTestCase):

    async def test_word_exists_returns_page_id(self):
        page_id = "word-page-id"
        notion_mod.client.data_sources.query = AsyncMock(return_value={
            "results": [{"id": page_id}]
        })

        result = await exists_word("pending")
        logger.info(f"단어 존재 시 → page_id: {result}")
        self.assertEqual(result, page_id)

    async def test_word_not_exists_returns_none(self):
        notion_mod.client.data_sources.query = AsyncMock(return_value={
            "results": []
        })

        result = await exists_word("abandon")
        logger.info(f"단어 없을 시 → {result}")
        self.assertIsNone(result)


class TestAddWord(unittest.IsolatedAsyncioTestCase):

    async def test_add_word_returns_page_id(self):
        page_id = "new-word-page-id"
        notion_mod.client.pages.create = AsyncMock(return_value={"id": page_id})

        result = await add_word("pending", "아직 처리되지 않고 기다리는 상태")
        logger.info(f"단어 저장 결과 → page_id: {result}")
        self.assertEqual(result, page_id)

    async def test_add_word_saves_correct_properties(self):
        notion_mod.client.pages.create = AsyncMock(return_value={"id": "some-id"})

        await add_word("abandon", "버리다, 포기하다")

        call_kwargs = notion_mod.client.pages.create.call_args.kwargs
        word    = call_kwargs["properties"]["단어"]["title"][0]["text"]["content"]
        meaning = call_kwargs["properties"]["의미"]["rich_text"][0]["text"]["content"]
        stage   = call_kwargs["properties"]["단계"]["number"]
        logger.info(f"저장된 단어: {word}, 뜻: {meaning}, 단계: {stage}")
        self.assertEqual(word, "abandon")
        self.assertEqual(meaning, "버리다, 포기하다")
        self.assertEqual(stage, 1)  # 항상 1단계로 시작


class TestGetWordsDue(unittest.IsolatedAsyncioTestCase):

    async def test_returns_due_words(self):
        due_pages = [{"id": "page-1"}, {"id": "page-2"}]
        notion_mod.client.data_sources.query = AsyncMock(return_value={
            "results": due_pages
        })

        result = await get_words_due()
        logger.info(f"오늘 리뷰할 단어 수 → {len(result)}")
        self.assertEqual(len(result), 2)

    async def test_returns_empty_when_no_due(self):
        notion_mod.client.data_sources.query = AsyncMock(return_value={
            "results": []
        })

        result = await get_words_due()
        logger.info(f"리뷰할 단어 없을 시 → {result}")
        self.assertEqual(result, [])


class TestUpdateWordStage(unittest.IsolatedAsyncioTestCase):

    async def test_correct_answer_advances_stage(self):
        # 현재 1단계 → 정답 → 2단계로 업데이트
        notion_mod.client.pages.retrieve = AsyncMock(return_value={
            "properties": {"단계": {"number": 1}}
        })
        notion_mod.client.pages.update = AsyncMock(return_value={})

        await update_word_stage("page-id", correct=True)

        call_kwargs = notion_mod.client.pages.update.call_args.kwargs
        next_stage = call_kwargs["properties"]["단계"]["number"]
        logger.info(f"정답 시 단계 변화 → 1 → {next_stage}")
        self.assertEqual(next_stage, 2)

    async def test_wrong_answer_resets_to_stage1(self):
        # 현재 3단계 → 오답 → 1단계로 초기화
        notion_mod.client.pages.retrieve = AsyncMock(return_value={
            "properties": {"단계": {"number": 3}}
        })
        notion_mod.client.pages.update = AsyncMock(return_value={})

        await update_word_stage("page-id", correct=False)

        call_kwargs = notion_mod.client.pages.update.call_args.kwargs
        next_stage = call_kwargs["properties"]["단계"]["number"]
        logger.info(f"오답 시 단계 초기화 → 3 → {next_stage}")
        self.assertEqual(next_stage, 1)

    async def test_stage3_correct_stays_at_3(self):
        # 3단계에서 정답 → 3단계 유지 (max)
        notion_mod.client.pages.retrieve = AsyncMock(return_value={
            "properties": {"단계": {"number": 3}}
        })
        notion_mod.client.pages.update = AsyncMock(return_value={})

        await update_word_stage("page-id", correct=True)

        call_kwargs = notion_mod.client.pages.update.call_args.kwargs
        next_stage = call_kwargs["properties"]["단계"]["number"]
        logger.info(f"3단계 정답 시 → {next_stage} (3 유지)")
        self.assertEqual(next_stage, 3)


if __name__ == "__main__":
    unittest.main(verbosity=2)
