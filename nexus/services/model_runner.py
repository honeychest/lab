"""
LLM 실행 계층. 폴백 체인, 타임아웃, provider 선택을 담당.
ai_service.py는 이 모듈을 통해서만 LLM을 호출한다.
"""
import asyncio
import logging
import time

from config import settings
from services.ai_parsers import parse_response

logger = logging.getLogger(__name__)

MODELS = [
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-pro-latest",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
]


async def run(prompt: str, timeout: float = 8.0) -> dict:
    """표준 텍스트 생성. AI_PROVIDER에 따라 Gemini 폴백 체인 또는 Claude."""
    if settings.AI_PROVIDER == "gemini":
        return await _gemini(prompt, timeout)
    return await _claude(prompt)


async def run_url_context(prompt: str, timeout: float = 30.0) -> dict:
    """url_context 툴로 웹 페이지를 직접 브라우징해 생성."""
    from google import genai
    from google.genai import types as gtypes

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    config = gtypes.GenerateContentConfig(
        tools=[gtypes.Tool(url_context=gtypes.UrlContext())],
        automatic_function_calling=gtypes.AutomaticFunctionCallingConfig(disable=True),
    )
    for model in MODELS:
        t = time.time()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(model=model, contents=prompt, config=config),
                timeout=timeout,
            )
            logger.info(f"[url] 사용 모델: {model} ({time.time() - t:.2f}s)")
            return parse_response(response.text)
        except asyncio.TimeoutError:
            logger.warning(f"[url] {model} 타임아웃 ({time.time() - t:.2f}s)")
        except Exception as e:
            logger.warning(f"[url] {model} 실패 ({time.time() - t:.2f}s): {e}")
    raise Exception("모든 url 모델 실패")


async def run_youtube(url: str, prompt: str, timeout: float = 60.0) -> dict:
    """YouTube file_uri를 Gemini에 직접 전달."""
    from google import genai
    from google.genai import types as gtypes

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    for model in MODELS:
        t = time.time()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model,
                    contents=[gtypes.Part(file_data=gtypes.FileData(file_uri=url)), prompt],
                ),
                timeout=timeout,
            )
            logger.info(f"[youtube] 사용 모델: {model} ({time.time() - t:.2f}s)")
            return parse_response(response.text)
        except asyncio.TimeoutError:
            logger.warning(f"[youtube] {model} 타임아웃 ({time.time() - t:.2f}s)")
        except Exception as e:
            logger.warning(f"[youtube] {model} 실패 ({time.time() - t:.2f}s): {e}")
    raise Exception("모든 youtube 모델 실패")


async def _gemini(prompt: str, timeout: float) -> dict:
    from google import genai
    from google.genai import types as gtypes

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    config = gtypes.GenerateContentConfig(
        automatic_function_calling=gtypes.AutomaticFunctionCallingConfig(disable=True)
    )
    for model in MODELS:
        t = time.time()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(model=model, contents=prompt, config=config),
                timeout=timeout,
            )
            logger.info(f"[llm] 사용 모델: {model} ({time.time() - t:.2f}s)")
            return parse_response(response.text)
        except asyncio.TimeoutError:
            logger.warning(f"[llm] {model} 타임아웃 ({time.time() - t:.2f}s)")
        except Exception as e:
            logger.warning(f"[llm] {model} 실패 ({time.time() - t:.2f}s): {e}")
    raise Exception("모든 모델 실패")


async def _claude(prompt: str) -> dict:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return parse_response(message.content[0].text)
