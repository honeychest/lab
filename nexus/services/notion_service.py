import logging
from datetime import datetime, timezone, timedelta
from notion_client import AsyncClient
from chs import dlog
from config import settings

logger = logging.getLogger(__name__)
client = AsyncClient(auth=settings.NOTION_API_KEY)


def parse_word_page(page: dict) -> dict | None:
    """Notion 단어 페이지에서 속성 추출. 단어/의미 비어있으면 None 반환."""
    props      = page["properties"]
    title_list = props["단어"]["title"]
    rich_list  = props["의미"]["rich_text"]
    if not title_list or not rich_list:
        logger.warning(f"빈 단어 페이지 건너뜀 — page_id: {page['id']}")
        return None
    return {
        "page_id":    page["id"],
        "word":       title_list[0]["text"]["content"],
        "meaning_ko": rich_list[0]["text"]["content"],
        "stage":      int(props["단계"]["number"]),
    }


async def exists(url: str) -> str | None:
    """URL이 Notion DB에 이미 저장되어 있으면 page_id 반환, 없으면 None."""
    try:
        response = await client.data_sources.query(
            data_source_id=settings.NOTION_LINK_DATABASE_ID,
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
        parent={"type": "data_source_id", "data_source_id": settings.NOTION_LINK_DATABASE_ID},
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


async def exists_word(word: str) -> str | None:
    """단어가 영단어 DB에 이미 있으면 page_id 반환, 없으면 None."""
    try:
        response = await client.data_sources.query(
            data_source_id=settings.NOTION_WORD_DATABASE_ID,
            filter={"property": "단어", "title": {"equals": word}},
        )
        results = response.get("results", [])
        if results:
            return results[0]["id"]
        return None
    except Exception as e:
        logger.warning(f"영단어 중복 확인 실패: {e}")
        return None


STAGE_DAYS = {1: 1, 2: 3, 3: 7, 4: 30}  # 5단계는 랜덤(60~120일), 6단계 = 졸업
MAX_ACTIVE_STAGE = 5
GRADUATED_STAGE  = 6


async def add_word(word: str, meaning: str) -> str:
    """영단어를 Notion DB에 저장하고 page_id 반환."""
    today = datetime.now(timezone.utc)
    next_review = (today + timedelta(days=STAGE_DAYS[1])).isoformat()
    response = await client.pages.create(
        parent={"type": "data_source_id", "data_source_id": settings.NOTION_WORD_DATABASE_ID},
        properties={
            "단어": {"title": [{"text": {"content": word}}]},
            "의미": {"rich_text": [{"text": {"content": meaning}}]},
            "단계": {"number": 1},
            "등록일": {"date": {"start": today.isoformat()}},
            "다음리뷰일": {"date": {"start": next_review}},
        }
    )
    page_id = response["id"]
    logger.info(f"영단어 저장 완료 - word: {word}, page_id: {page_id}")
    return page_id


async def get_all_words() -> list:
    """단어장 전체 조회 — /quiz 전용. 다음리뷰일 오름차순 (오래된 단어 우선)."""
    response = await client.data_sources.query(
        data_source_id=settings.NOTION_WORD_DATABASE_ID,
        sorts=[{"property": "다음리뷰일", "direction": "ascending"}],
    )
    return response.get("results", [])


async def search_words_containing(keyword: str) -> list:
    """단어 필드에 keyword가 포함된 항목 목록 반환."""
    response = await client.data_sources.query(
        data_source_id=settings.NOTION_WORD_DATABASE_ID,
        filter={"property": "단어", "title": {"contains": keyword}},
    )
    return response.get("results", [])


async def get_words_due() -> list:
    """오늘 리뷰할 단어 목록 반환. 졸업(6단계) 단어 제외."""
    today = datetime.now(timezone.utc).date().isoformat()
    response = await client.data_sources.query(
        data_source_id=settings.NOTION_WORD_DATABASE_ID,
        filter={"property": "다음리뷰일", "date": {"on_or_before": today}},
    )
    results = response.get("results", [])
    return [p for p in results if p.get("properties", {}).get("단계", {}).get("number", 0) < GRADUATED_STAGE]


async def add_inbox(text: str, kind: str, date: str | None) -> str:
    """Notion Inbox DB에 항목 저장 — 할일 또는 아이디어."""
    props = {
        "내용": {"title": [{"text": {"content": text}}]},
        "종류": {"select": {"name": kind}},
        "상태": {"select": {"name": "대기"}},
    }
    if date:
        props["날짜"] = {"date": {"start": date}}

    response = await client.pages.create(
        parent={"type": "data_source_id", "data_source_id": settings.NOTION_INBOX_DATABASE_ID},
        properties=props
    )
    page_id = response["id"]
    logger.info(f"Inbox 항목 저장 완료 - kind: {kind}, page_id: {page_id}")
    return page_id


async def get_todos_by_date(date_iso: str) -> list:
    """특정 날짜의 할일 조회 (상태='대기')."""
    try:
        response = await client.data_sources.query(
            data_source_id=settings.NOTION_INBOX_DATABASE_ID,
            filter={
                "and": [
                    {"property": "종류", "select": {"equals": "할일"}},
                    {"property": "상태", "select": {"equals": "대기"}},
                    {"property": "날짜", "date": {"equals": date_iso}},
                ]
            }
        )
        results = response.get("results", [])
        todos = []
        for page in results:
            text = page.get("properties", {}).get("내용", {}).get("title", [])
            if text:
                todos.append({
                    "page_id": page["id"],
                    "text": text[0]["text"]["content"]
                })
        return todos
    except Exception as e:
        logger.warning(f"Notion 할일 조회 실패: {e}")
        return []


async def get_todos_overdue(today_iso: str) -> list:
    """오늘 이전 날짜의 미완료 할일 조회 (기한 초과)."""
    try:
        dlog("종류=할일 & 상태=대기 & 날짜 before today 필터로 Notion 조회")
        response = await client.data_sources.query(
            data_source_id=settings.NOTION_INBOX_DATABASE_ID,
            filter={
                "and": [
                    {"property": "종류", "select": {"equals": "할일"}},
                    {"property": "상태", "select": {"equals": "대기"}},
                    {"property": "날짜", "date": {"before": today_iso}},
                ]
            }
        )
        results = response.get("results", [])
        dlog("결과 순회 — page_id, 내용 text 추출")
        todos = []
        for page in results:
            text = page.get("properties", {}).get("내용", {}).get("title", [])
            if text:
                todos.append({
                    "page_id": page["id"],
                    "text": text[0]["text"]["content"]
                })
        dlog("추출 결과 list 반환 — build_schedule_content에서 overdue 항목으로 사용")
        return todos
    except Exception as e:
        logger.warning(f"Notion 기한 초과 할일 조회 실패: {e}")
        return []


async def get_todos_done_today() -> list:
    """오늘 완료된 항목 조회 (KST 기준)."""
    try:
        today = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=9))).date().isoformat()
        response = await client.data_sources.query(
            data_source_id=settings.NOTION_INBOX_DATABASE_ID,
            filter={
                "and": [
                    {"property": "상태", "select": {"equals": "완료"}},
                    {"property": "날짜", "date": {"equals": today}},
                ]
            }
        )
        results = response.get("results", [])
        todos = []
        for page in results:
            text = page.get("properties", {}).get("내용", {}).get("title", [])
            if text:
                todos.append({
                    "page_id": page["id"],
                    "text": text[0]["text"]["content"]
                })
        return todos
    except Exception as e:
        logger.warning(f"Notion 완료 항목 조회 실패: {e}")
        return []


async def update_inbox_status(page_id: str, status: str) -> None:
    """Inbox 항목 상태 업데이트."""
    try:
        await client.pages.update(
            page_id=page_id,
            properties={"상태": {"select": {"name": status}}}
        )
        logger.info(f"Inbox 상태 업데이트 - page_id: {page_id}, status: {status}")
    except Exception as e:
        logger.warning(f"Notion 상태 업데이트 실패: {e}")
        raise


async def update_inbox_date(page_id: str, new_date_iso: str) -> None:
    """Inbox 항목 날짜 업데이트."""
    try:
        await client.pages.update(
            page_id=page_id,
            properties={"날짜": {"date": {"start": new_date_iso}}}
        )
        logger.info(f"Inbox 날짜 업데이트 - page_id: {page_id}, date: {new_date_iso}")
    except Exception as e:
        logger.warning(f"Notion 날짜 업데이트 실패: {e}")
        raise


async def update_word_stage(page_id: str, correct: bool) -> None:
    """퀴즈 결과에 따라 단계와 다음리뷰일 업데이트."""
    import random

    page = await client.pages.retrieve(page_id=page_id)
    current_stage = page["properties"]["단계"]["number"]

    if correct and current_stage >= MAX_ACTIVE_STAGE:
        next_stage = GRADUATED_STAGE
        next_review = (datetime.now(timezone.utc) + timedelta(days=9999)).isoformat()
    elif correct:
        next_stage = current_stage + 1
        days = random.randint(60, 120) if next_stage == MAX_ACTIVE_STAGE else STAGE_DAYS[next_stage]
        next_review = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    else:
        next_stage = 1
        next_review = (datetime.now(timezone.utc) + timedelta(days=STAGE_DAYS[1])).isoformat()

    await client.pages.update(
        page_id=page_id,
        properties={
            "단계": {"number": next_stage},
            "다음리뷰일": {"date": {"start": next_review}},
        }
    )
    logger.info(f"단어 단계 업데이트 - page_id: {page_id}, stage: {current_stage}→{next_stage}, correct: {correct}")