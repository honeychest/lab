import logging
from datetime import datetime, timezone
from notion_client import AsyncClient
from config import settings

logger = logging.getLogger(__name__)
client = AsyncClient(auth=settings.NOTION_API_KEY)


async def exists(url: str) -> str | None:
    """URL이 Notion DB에 이미 저장되어 있으면 page_id 반환, 없으면 None."""
    try:
        response = await client.data_sources.query(
            data_source_id=settings.NOTION_DATABASE_ID,
            filter={"property": "원본", "url": {"equals": url}},
        )
        results = response.get("results", [])
        if results:
            return results[0]["id"]
        return None
    except Exception as e:
        logger.warning(f"Notion 중복 확인 실패: {e}")
        return None


async def delete_page(page_id: str) -> None:
    """Notion 페이지를 삭제(archived 처리)."""
    try:
        await client.pages.update(page_id=page_id, archived=True)
        logger.info(f"Notion 페이지 삭제 완료: {page_id}")
    except Exception as e:
        logger.warning(f"Notion 페이지 삭제 실패: {e}")


async def save(url: str, title: str, summary: str, platform: str= "telegram") -> str:
    response = await client.pages.create(
        parent={"database_id": settings.NOTION_DATABASE_ID},
        properties={
            "제목": {
                "title": [{"text": {"content": title}}] # title 만 조작가능한 부분이고 나머지는 다 notion양식이라 변경x
            },
            "원본": {
                "url": url
            },
            "플랫폼": {
                "select": {"name": platform}
            },
            "저장일시": {
                "date": {"start": datetime.now(timezone.utc).isoformat()}
            },
        },
        children=[
            {
                "object": "block",
                "type": "paragraph",
                "paragraph":{
                    "rich_text": [{"type": "text", "text": {"content": summary}}]
                }
            }
        ]
    )

    page_id = response["id"]
    logger.info(f"노션 저장 완료  - page_id: {page_id}")
    return page_id