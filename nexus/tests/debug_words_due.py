"""
실제 Notion DB 조회 디버그 스크립트.
날짜를 입력받아 get_words_due() 결과를 출력합니다.

실행 방법 (nexus/ 디렉토리에서):
    python tests/debug_words_due.py
    python tests/debug_words_due.py 2026-04-08   ← 날짜 직접 지정
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from notion_client import AsyncClient
from config import settings

client = AsyncClient(auth=settings.NOTION_API_KEY)


async def fetch_with_filter(date_str: str) -> list:
    """data_sources.query + on_or_before 필터 (현재 get_words_due 방식)."""
    response = await client.data_sources.query(
        data_source_id=settings.NOTION_WORD_DATABASE_ID,
        filter={"property": "다음리뷰일", "date": {"on_or_before": date_str}},
    )
    return response.get("results", [])


async def fetch_all_sorted() -> list:
    """data_sources.query + 필터 없이 날짜 오름차순 (현재 get_all_words 방식)."""
    response = await client.data_sources.query(
        data_source_id=settings.NOTION_WORD_DATABASE_ID,
        sorts=[{"property": "다음리뷰일", "direction": "ascending"}],
    )
    return response.get("results", [])


def parse(page: dict) -> dict | None:
    props = page.get("properties", {})
    title_list = props.get("단어", {}).get("title", [])
    rich_list  = props.get("의미", {}).get("rich_text", [])
    date_val   = (props.get("다음리뷰일", {}).get("date") or {})
    stage      = props.get("단계", {}).get("number", "?")
    if not title_list:
        return None
    return {
        "단어":      title_list[0]["text"]["content"],
        "의미":      rich_list[0]["text"]["content"] if rich_list else "(없음)",
        "단계":      stage,
        "다음리뷰일": date_val.get("start", "(없음)"),
    }


def print_results(label: str, pages: list, target_date: str) -> None:
    print(f"\n{'='*50}")
    print(f"[{label}]  기준 날짜: {target_date}")
    print(f"{'='*50}")
    if not pages:
        print("  (결과 없음)")
        return
    for p in pages:
        info = parse(p)
        if info:
            marker = " ◀ 기준일 이전" if info["다음리뷰일"][:10] <= target_date else ""
            print(f"  {info['단어']:20s}  단계:{info['단계']}  리뷰일:{info['다음리뷰일'][:10]}{marker}")


async def main(target_date: str) -> None:
    print(f"\n기준 날짜: {target_date}")

    # 방법 1: 현재 get_words_due 방식 (필터 사용)
    try:
        filtered = await fetch_with_filter(target_date)
        print_results("필터 방식 (현재 get_words_due)", filtered, target_date)
    except Exception as e:
        print(f"\n[필터 방식] 오류 발생: {e}")
        filtered = []

    # 방법 2: 전체 조회 후 Python 필터링
    all_words = await fetch_all_sorted()
    due_in_python = [p for p in all_words if (
        (lambda d: d and d[:10] <= target_date)(
            (p.get("properties", {}).get("다음리뷰일", {}).get("date") or {}).get("start")
        )
    )]
    print_results("Python 필터링 방식 (전체 조회 후)", due_in_python, target_date)

    # 요약
    print(f"\n{'='*50}")
    print(f"필터 방식 결과:         {len(filtered)}개")
    print(f"Python 필터링 결과:     {len(due_in_python)}개")
    if len(filtered) != len(due_in_python):
        print("  → 결과 불일치! 필터 방식이 오작동하고 있음")
    else:
        print("  → 결과 일치")
    print()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        date_input = sys.argv[1]
    else:
        date_input = input("기준 날짜 입력 (예: 2026-04-10, 엔터 시 오늘): ").strip()
        if not date_input:
            from datetime import datetime, timezone
            date_input = datetime.now(timezone.utc).date().isoformat()

    asyncio.run(main(date_input))
