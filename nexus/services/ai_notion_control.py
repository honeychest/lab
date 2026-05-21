from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from config import settings
from services import notion_service

"""AI-facing helpers for local Notion table inspection and mutation.

This module is intentionally generic. Agents can point it at any Notion
data_source_id, or at a Settings/.env key, then list/schema/create/update/upsert
rows without writing one-off scripts.
"""


@dataclass(frozen=True)
class TableRow:
    page_id: str
    values: dict[str, Any]


def data_source_id_from(value: str | None, env_key: str | None) -> str:
    if value:
        return value
    if env_key:
        found = getattr(settings, env_key, "")
        if found:
            return found
        raise ValueError(f".env 설정을 찾을 수 없습니다: {env_key}")
    raise ValueError("--data-source-id 또는 --env-key 중 하나가 필요합니다")


def load_json_arg(value: str | None, file_path: str | None) -> Any:
    if file_path:
        return json.loads(Path(file_path).read_text(encoding="utf-8"))
    if value:
        return json.loads(value)
    raise ValueError("--json 또는 --json-file 중 하나가 필요합니다")


def plain_text(items: list[dict]) -> str:
    return "".join(item.get("plain_text", "") for item in items).strip()


def select_name(prop: dict) -> str:
    item = prop.get("select")
    return item.get("name", "") if item else ""


def page_values(page: dict) -> dict[str, Any]:
    values = {}
    for name, prop in page.get("properties", {}).items():
        ptype = prop.get("type")
        if ptype == "title":
            values[name] = plain_text(prop.get("title", []))
        elif ptype == "rich_text":
            values[name] = plain_text(prop.get("rich_text", []))
        elif ptype == "select":
            values[name] = select_name(prop)
        elif ptype == "checkbox":
            values[name] = prop.get("checkbox", False)
        elif ptype == "date":
            values[name] = (prop.get("date") or {}).get("start", "")
        else:
            values[name] = prop.get(ptype)
    return values


def property_value(kind: str, value: Any) -> dict:
    if kind == "title":
        return {"title": [{"text": {"content": str(value)}}]}
    if kind == "rich_text":
        return {"rich_text": [{"text": {"content": str(value)}}]}
    if kind == "select":
        return {"select": {"name": str(value)}} if value else {"select": None}
    if kind == "checkbox":
        return {"checkbox": bool(value)}
    if kind == "date":
        return {"date": {"start": str(value)}} if value else {"date": None}
    if kind == "number":
        return {"number": value}
    if kind == "url":
        return {"url": value}
    raise ValueError(f"지원하지 않는 property 타입입니다: {kind}")


def build_properties(spec: dict[str, Any]) -> dict:
    """{"이름": {"type": "title", "value": "..."}} 형태를 Notion properties로 변환."""
    properties = {}
    for name, item in spec.items():
        if not isinstance(item, dict) or "type" not in item:
            raise ValueError(f"속성 spec 형식이 잘못됐습니다: {name}")
        properties[name] = property_value(item["type"], item.get("value"))
    return properties


def equals_filter(property_name: str, value: str, property_type: str = "title") -> dict:
    if property_type == "title":
        return {"property": property_name, "title": {"equals": value}}
    if property_type == "rich_text":
        return {"property": property_name, "rich_text": {"equals": value}}
    if property_type == "select":
        return {"property": property_name, "select": {"equals": value}}
    if property_type == "date":
        return {"property": property_name, "date": {"equals": value}}
    raise ValueError(f"match 필터 타입을 지원하지 않습니다: {property_type}")


async def retrieve_schema(data_source_id: str) -> dict[str, str]:
    data_source = await notion_service.client.data_sources.retrieve(data_source_id=data_source_id)
    return {
        name: prop.get("type", "")
        for name, prop in data_source.get("properties", {}).items()
    }


async def list_rows(data_source_id: str, *, limit: int = 20) -> list[TableRow]:
    response = await notion_service.client.data_sources.query(
        data_source_id=data_source_id,
        page_size=limit,
    )
    return [
        TableRow(page_id=page["id"], values=page_values(page))
        for page in response.get("results", [])
    ]


async def create_row(data_source_id: str, spec: dict[str, Any]) -> str:
    response = await notion_service.client.pages.create(
        parent={"type": "data_source_id", "data_source_id": data_source_id},
        properties=build_properties(spec),
    )
    return response["id"]


async def update_row(page_id: str, spec: dict[str, Any]) -> None:
    await notion_service.client.pages.update(
        page_id=page_id,
        properties=build_properties(spec),
    )


async def find_row(
    data_source_id: str,
    *,
    match_property: str,
    match_value: str,
    match_type: str = "title",
) -> str | None:
    response = await notion_service.client.data_sources.query(
        data_source_id=data_source_id,
        filter=equals_filter(match_property, match_value, match_type),
        page_size=1,
    )
    results = response.get("results", [])
    return results[0]["id"] if results else None


async def upsert_row(
    data_source_id: str,
    spec: dict[str, Any],
    *,
    match_property: str,
    match_value: str,
    match_type: str = "title",
) -> tuple[str, str]:
    page_id = await find_row(
        data_source_id,
        match_property=match_property,
        match_value=match_value,
        match_type=match_type,
    )
    if page_id:
        await update_row(page_id, spec)
        return "updated", page_id
    return "created", await create_row(data_source_id, spec)


def recovery_schedule_specs(base_date: str) -> list[dict[str, Any]]:
    rows = [
        ("커튼 열기 / 물 마시기", "07:00", "수면", "깼으면 바로 커튼 열고 물 마시기"),
        ("간단한 아침", "07:10", "식사", "계란/바나나/요거트/밥 조금"),
        ("세수 / 양치 / 옷 갈아입기", "07:30", "준비", "침대 밖 상태를 확정하기"),
        ("가벼운 활동 1개", "08:00", "활동", "설거지, 책상 정리, 산책 10분 중 하나"),
        ("계획된 회복 수면 종료", "10:30", "수면", "다시 잤다면 여기서 끊고 일어나기"),
        ("핵심 작업 1", "11:00", "작업", "이력서, 지원공고 확인, 공부 중 하나 60분"),
        ("점심", "12:30", "식사", "점심 먹기"),
        ("산책 또는 가벼운 운동", "13:30", "운동", "산책 20분 또는 가벼운 운동"),
        ("핵심 작업 2", "14:30", "작업", "구직, 공부, 정리 중 하나 60-90분"),
        ("쉬는 시간", "16:00", "휴식", "게임/유튜브 가능. 침대는 금지"),
        ("저녁", "18:00", "식사", "저녁 먹기"),
        ("집안일 + 내일 할 일 3개", "19:00", "정리", "집안일 20분 후 내일 할 일 3개 적기"),
        ("화면 줄이기", "23:30", "수면", "조명 어둡게, 화면 줄이기"),
        ("침대 들어가기", "00:30", "수면", "취침 목표. 바로 23시로 당기려 하지 않기"),
    ]
    specs = []
    for name, time_text, category, message in rows:
        day = base_date
        if time_text == "00:30":
            day = datetime.fromisoformat(base_date).date().isoformat()
        specs.append({
            "이름": {"type": "title", "value": name},
            "시간": {"type": "date", "value": f"{day}T{time_text}:00+09:00"},
            "반복": {"type": "select", "value": "매일"},
            "메시지": {"type": "rich_text", "value": message},
            "확인": {"type": "checkbox", "value": False},
            "분류": {"type": "select", "value": category},
            "상태": {"type": "select", "value": "대기"},
        })
    return specs


async def seed_recovery_schedule(data_source_id: str, *, base_date: str) -> list[tuple[str, str, str]]:
    results = []
    for spec in recovery_schedule_specs(base_date):
        name = spec["이름"]["value"]
        action, page_id = await upsert_row(
            data_source_id,
            spec,
            match_property="이름",
            match_value=name,
            match_type="title",
        )
        results.append((action, page_id, name))
    return results
