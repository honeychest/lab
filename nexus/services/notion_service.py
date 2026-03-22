import logging
from notion_client import AsyncClient
from config import settings

logger = logging.getLogger(__name__)
client = AsyncClient(auth=settings.NOTION_API_KEY)

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