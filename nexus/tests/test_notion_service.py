import asyncio
import os
import sys
import types
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class _AsyncClientStub:
    def __init__(self, auth=None):
        self.auth = auth


sys.modules.setdefault("notion_client", types.SimpleNamespace(AsyncClient=_AsyncClientStub))
sys.modules.setdefault(
    "config",
    types.SimpleNamespace(
        settings=types.SimpleNamespace(
            NOTION_API_KEY="test-key",
            NOTION_LINK_DATABASE_ID="link-db",
            NOTION_WORD_DATABASE_ID="word-db",
            NOTION_INBOX_DATABASE_ID="inbox-db",
        )
    ),
)

from services import notion_service


def _run(coro):
    return asyncio.run(coro)


class _PagesStub:
    def __init__(self):
        self.create_kwargs = None

    async def create(self, **kwargs):
        self.create_kwargs = kwargs
        return {"id": "page-1"}


class TestSaveLink(unittest.TestCase):

    def test_save_fills_link_tags_from_explicit_ai_result_tags(self):
        pages = _PagesStub()
        notion_service.client = types.SimpleNamespace(pages=pages)

        _run(notion_service.save(
            "https://github.com/a/b",
            "title",
            "제목: Claude Code 컨텍스트 관리 Skill\n- 요약",
            platform="github",
            tags=["Claude", "클로드", "AI에이전트", "컨텍스트 관리"],
        ))

        self.assertEqual(
            pages.create_kwargs["properties"]["태그"],
            {"multi_select": [
                {"name": "Claude"},
                {"name": "클로드"},
                {"name": "AI에이전트"},
                {"name": "컨텍스트 관리"},
            ]},
        )

    def test_save_fills_link_tags_from_summary_tag_line(self):
        pages = _PagesStub()
        notion_service.client = types.SimpleNamespace(pages=pages)
        summary = (
            "제목: Claude Code 컨텍스트 관리 Skill\n"
            "- Claude Code에서 컨텍스트 낭비를 줄이는 방법\n"
            "태그: Claude, 클로드, AI에이전트, 컨텍스트 관리"
        )

        page_id = _run(notion_service.save("https://github.com/a/b", "title", summary, platform="github"))

        self.assertEqual(page_id, "page-1")
        self.assertEqual(
            pages.create_kwargs["properties"]["태그"],
            {"multi_select": [
                {"name": "Claude"},
                {"name": "클로드"},
                {"name": "AI에이전트"},
                {"name": "컨텍스트 관리"},
            ]},
        )
        saved_text = pages.create_kwargs["children"][0]["paragraph"]["rich_text"][0]["text"]["content"]
        self.assertNotIn("태그:", saved_text)


if __name__ == "__main__":
    unittest.main()
