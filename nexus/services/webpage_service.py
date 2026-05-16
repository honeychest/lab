import logging
from services import jina_service

logger = logging.getLogger(__name__)


async def get_content(url: str) -> str:
    try:
        return await jina_service.fetch(url)
    except Exception as e:
        logger.warning(f"[webpage] Jina 실패: {e} — curl_cffi 폴백")

    try:
        return _fetch_curl_cffi(url)
    except Exception as e:
        logger.warning(f"[webpage] curl_cffi 실패: {e} — BeautifulSoup 폴백")

    try:
        return _fetch_bs4(url)
    except Exception as e:
        logger.warning(f"[webpage] BS4 실패: {e} — Firecrawl 폴백")

    return await _fetch_firecrawl(url)


def _fetch_curl_cffi(url: str) -> str:
    from curl_cffi.requests import Session
    import trafilatura

    with Session(impersonate="chrome") as s:
        r = s.get(url, timeout=15)
        r.raise_for_status()

    text = trafilatura.extract(r.text, include_links=False, include_tables=False)
    if not text:
        raise ValueError("trafilatura 추출 결과 없음")
    logger.info(f"[webpage] curl_cffi+trafilatura 추출 완료 - 길이: {len(text)}")
    return text[:40000]


async def _fetch_firecrawl(url: str) -> str:
    from firecrawl import V1FirecrawlApp
    from config import settings

    if not settings.FIRECRAWL_API_KEY:
        raise ValueError("FIRECRAWL_API_KEY 미설정")

    app = V1FirecrawlApp(api_key=settings.FIRECRAWL_API_KEY)
    result = app.scrape_url(url, formats=["markdown"])
    text = getattr(result, "markdown", None) or ""
    if not text:
        raise ValueError("Firecrawl 추출 결과 없음")
    logger.info(f"[webpage] Firecrawl 추출 완료 - 길이: {len(text)}")
    return text[:40000]


def _fetch_bs4(url: str) -> str:
    import requests
    from bs4 import BeautifulSoup

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    })
    r = session.get(url, timeout=10)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()
    text = soup.get_text(separator=" ", strip=True)
    logger.info(f"[webpage] BS4 추출 완료 - 길이: {len(text)}")
    return text[:40000]
