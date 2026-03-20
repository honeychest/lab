import logging
import requests
from bs4 import BeautifulSoup
logger = logging.getLogger(__name__)

async def get_content(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebkit/537.36"
    }

    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    # 불필요한 태그 제거
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    text = soup.get_text(separator=" ", strip=True)
    logger.info(f"웹페이지 추출 완료 - url: {url}, 길이: {len(text)}")
    return text[:40000]  # AI에 넘길 텍스트가 너무 길면 토큰 낭비라 앞 8000자만 사용