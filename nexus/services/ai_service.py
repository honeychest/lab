import logging
import re
from config import settings

logger = logging.getLogger(__name__)

async def summarize(text: str, source_url: str) -> dict:
    if settings.AI_PROVIDER == "gemini": # config.py 에 있는값.
        return await _summarize_gemini(text, source_url)
    return await _summarize_claude(text, source_url)

async def _summarize_gemini(text: str, source_url: str) -> dict:
    from google import genai
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    models = ["gemma-3-27b-it","gemma-3-12b-it","gemma-3-4b-it","gemma-3n-e2b-it","gemma-3-1b-it"]
    for model in models:
        try:
            response = await client.aio.models.generate_content(
                model=model,
                contents=_build_prompt(text, source_url)
            )
            return _parse_response(response.text)
        except Exception as e:
            logger.warning(f"모델 {model} 실패: {e}")
    raise Exception("모든 모델 실패")

async def _summarize_claude(text: str, source_url: str) -> dict:
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": _build_prompt(text, source_url)}]
    )
    return _parse_response(message.content[0].text)

def _build_prompt(text: str, source_url: str) -> str:
    return f"""아래 내용을 한국어로 요약하고 다음 양식으로 답해줘. 마크다운 굵게(**) 사용 금지.
          요약 양식:
          제목: (한 줄 핵심 주제)
            - 주요내용 bullet 3~5개
            - 한 줄 결론
          내용:
          {text}
                  """

def _parse_response(text: str) -> dict:
    match = re.search(r'\*{0,2}제목:\*{0,2}\s*(.*)', text)
    title = match.group(1).strip() if match else ""
    logger.info(f"파싱된 제목: '{title}'")
    return {"title": title, "summary": text}