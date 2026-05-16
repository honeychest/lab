import httpx
import logging

logger = logging.getLogger(__name__)


async def fetch(url: str, timeout: float = 20.0) -> str:
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.get(
            f"https://r.jina.ai/{url}",
            headers={"Accept": "text/plain", "X-Return-Format": "markdown"},
        )
        r.raise_for_status()
        text = r.text
    logger.info(f"[jina] 추출 완료 - 길이: {len(text)}")
    return text
