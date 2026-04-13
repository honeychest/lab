import logging
import os
import sys
from contextlib import asynccontextmanager

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from chs import dlog
from config import settings

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _mcp_session():
    dlog("StdioServerParameters 구성 — command=korean-law-mcp, env에 LAW_OC 주입")
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    params = StdioServerParameters(
        command=npx,
        args=["korean-law-mcp"],
        env={**os.environ, "LAW_OC": settings.LAW_OC},
    )
    dlog("stdio_client(params) 컨텍스트 진입 — MCP 서버 subprocess 구동")
    async with stdio_client(params) as (read, write):
        dlog("ClientSession(read, write) 생성")
        async with ClientSession(read, write) as session:
            dlog("session.initialize() 호출 — 핸드셰이크 완료")
            await session.initialize()
            dlog("session yield — 호출부에서 도구 호출 가능")
            yield session
    dlog("컨텍스트 종료 시 subprocess 자동 정리")


async def _call_tool(session: ClientSession, tool_name: str, arguments: dict) -> str:
    dlog(f"session.call_tool({tool_name}) 호출")
    result = await session.call_tool(tool_name, arguments)
    dlog("isError=True 이면 빈 문자열 반환")
    if result.isError:
        logger.warning(f"MCP 도구 오류: {tool_name} — {result.content}")
        return ""
    dlog("result.content[0].text 추출 후 반환")
    return result.content[0].text if result.content else ""


async def research_law(query: str) -> str:
    """MCP chain_full_research로 법령 종합 조사. 결과 문자열 반환."""
    try:
        async with _mcp_session() as session:
            dlog("chain_full_research(query) 호출 — 법령 원문·판례·해석례 종합 조사")
            result = await _call_tool(session, "chain_full_research", {"query": query})
            dlog("결과 문자열 반환")
            return result
    except Exception as e:
        logger.error(f"MCP 법령 조사 실패: {e}")
        return ""
