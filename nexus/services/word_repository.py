import logging
from typing import Any

logger = logging.getLogger(__name__)


class WordRepository:
    def __init__(self, notion_words: Any):
        self._notion_words = notion_words

    async def get_due_words(self) -> list[dict]:
        pages = await self._notion_words.get_words_due()
        return _parse_word_pages(pages)

    async def get_all_words(self) -> list[dict]:
        pages = await self._notion_words.get_all_words()
        return _parse_word_pages(pages)

    async def search_words_containing(self, keyword: str) -> list[dict]:
        pages = await self._notion_words.search_words_containing(keyword)
        return _parse_word_pages(pages)


def _parse_word_pages(pages: list[dict]) -> list[dict]:
    return [word for page in pages if (word := parse_word_page(page))]


def parse_word_page(page: dict) -> dict | None:
    props = page["properties"]
    title_list = props["단어"]["title"]
    rich_list = props["의미"]["rich_text"]
    if not title_list or not rich_list:
        logger.warning(f"빈 단어 페이지 건너뜀 — page_id: {page['id']}")
        return None
    return {
        "page_id": page["id"],
        "word": title_list[0]["text"]["content"],
        "meaning_ko": rich_list[0]["text"]["content"],
        "stage": int(props["단계"]["number"]),
    }
