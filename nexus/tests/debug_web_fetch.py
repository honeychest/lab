#!/Users/honey/devcontext/project/home/nexus/.venv/bin/python
"""
웹 fetch 체인 및 URL 요약 테스트.
Jina → curl_cffi+trafilatura → BS4 폴백 체인과 전체 요약 파이프라인을 검증합니다.

실행 방법 (nexus/ 디렉토리에서):
    tests/debug_web_fetch.py
    tests/debug_web_fetch.py "https://example.com"
    tests/debug_web_fetch.py --summarize
    tests/debug_web_fetch.py "https://example.com" --lmstudio-only
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings

DEFAULT_URLS = [
    "https://news.ycombinator.com",
    "https://github.com/anthropics/anthropic-sdk-python",
    "https://docs.python.org/3/library/asyncio.html",
]


def _preview(text: str, lines: int = 3) -> str:
    out = []
    for line in text.splitlines():
        line = line.strip()
        if line:
            out.append(line[:100])
        if len(out) >= lines:
            break
    return "\n      ".join(out)


def _row(label: str, ok: bool, elapsed: float, chars: int, text: str) -> None:
    mark = "✔" if ok else "✘"
    if ok:
        print(f"  {mark} {label:<28} {elapsed:5.2f}s  {chars:,}자")
        print(f"      {_preview(text)}")
    else:
        print(f"  {mark} {label:<28} {elapsed:5.2f}s  ERR: {text[:80]}")


# ── 1. fetch 체인 개별 테스트 ──────────────────────────────────────

async def test_jina(url: str) -> None:
    from services.jina_service import fetch
    t = time.time()
    try:
        text = await fetch(url)
        _row("Jina Reader", True, time.time() - t, len(text), text)
    except Exception as e:
        _row("Jina Reader", False, time.time() - t, 0, str(e))


def test_curl_cffi(url: str) -> None:
    from services.webpage_service import _fetch_curl_cffi
    t = time.time()
    try:
        text = _fetch_curl_cffi(url)
        _row("curl_cffi + trafilatura", True, time.time() - t, len(text), text)
    except Exception as e:
        _row("curl_cffi + trafilatura", False, time.time() - t, 0, str(e))


def test_bs4(url: str) -> None:
    from services.webpage_service import _fetch_bs4
    t = time.time()
    try:
        text = _fetch_bs4(url)
        _row("BeautifulSoup", True, time.time() - t, len(text), text)
    except Exception as e:
        _row("BeautifulSoup", False, time.time() - t, 0, str(e))


async def test_firecrawl(url: str) -> None:
    from services.webpage_service import _fetch_firecrawl
    t = time.time()
    try:
        text = await _fetch_firecrawl(url)
        _row("Firecrawl", True, time.time() - t, len(text), text)
    except Exception as e:
        _row("Firecrawl", False, time.time() - t, 0, str(e))


async def test_full_chain(url: str) -> None:
    from services.webpage_service import get_content
    t = time.time()
    try:
        text = await get_content(url)
        _row("전체 체인", True, time.time() - t, len(text), text)
    except Exception as e:
        _row("전체 체인", False, time.time() - t, 0, str(e))


# ── 2. Gemini UrlContext 단독 테스트 ──────────────────────────────

async def test_gemini_url_context(url: str) -> None:
    from services import model_runner
    from services.ai_service import _url_prompt_gemini
    t = time.time()
    try:
        result = await model_runner.run_url_context(_url_prompt_gemini(url), timeout=30.0)
        summary = result.get("summary", "")
        _row("Gemini UrlContext", True, time.time() - t, len(summary), summary)
    except Exception as e:
        _row("Gemini UrlContext", False, time.time() - t, 0, str(e)[:80])


# ── 3. 요약 파이프라인 테스트 ──────────────────────────────────────

async def test_summarize(url: str, lmstudio_only: bool = False) -> None:
    from services.webpage_service import get_content
    from services import model_runner
    from services.ai_service import _url_prompt_with_content

    t0 = time.time()
    try:
        content = await get_content(url)
    except Exception as e:
        _row("fetch", False, time.time() - t0, 0, str(e)[:80])
        return

    prompt = _url_prompt_with_content(url, content)

    if not lmstudio_only:
        t = time.time()
        try:
            orig = settings.AI_PROVIDER
            settings.AI_PROVIDER = "gemini"
            result = await model_runner.run(prompt, timeout=30.0)
            settings.AI_PROVIDER = orig
            summary = result.get("summary", "")
            _row("Gemini", True, time.time() - t, len(summary), summary)
        except Exception as e:
            _row("Gemini", False, time.time() - t, 0, str(e)[:80])

    t = time.time()
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(base_url=settings.LMSTUDIO_BASE_URL, api_key=settings.LMSTUDIO_API_KEY)
        models = await client.models.list()
        lm_model = models.data[0].id if models.data else None
        if lm_model:
            response = await asyncio.wait_for(
                client.chat.completions.create(
                    model=lm_model,
                    messages=[{"role": "user", "content": prompt}],
                ),
                timeout=settings.LMSTUDIO_TIMEOUT,
            )
            text = response.choices[0].message.content or ""
            _row(f"LMStudio:{lm_model[:20]}", True, time.time() - t, len(text), text)
        else:
            print("  ✘ LM Studio 모델 없음")
    except Exception as e:
        _row("LM Studio", False, time.time() - t, 0, str(e)[:80])


# ── main ──────────────────────────────────────────────────────────

async def main(urls: list[str], fetch_only: bool = False, lmstudio_only: bool = False) -> None:
    mode = "fetch only" if fetch_only else ("LM Studio only" if lmstudio_only else "fetch + summarize")
    print(f"\n{'='*60}")
    print(f"  웹 fetch 체인 테스트  [{mode}]")
    print(f"  {'방법':<28} {'시간':>6}  내용")
    print(f"{'='*60}")

    for url in urls:
        print(f"\n  URL: {url}")
        print(f"  {'─'*56}")
        await test_jina(url)
        test_curl_cffi(url)
        test_bs4(url)
        await test_firecrawl(url)
        await test_full_chain(url)
        print(f"  {'─'*56}")
        await test_gemini_url_context(url)

        if not fetch_only:
            print(f"  {'─'*56}")
            await test_summarize(url, lmstudio_only=lmstudio_only)

    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    args = sys.argv[1:]
    fetch_only = "--summarize" not in args
    lmstudio_only = "--lmstudio-only" in args
    url_args = [a for a in args if not a.startswith("--")]

    urls = url_args if url_args else DEFAULT_URLS
    asyncio.run(main(urls, fetch_only=fetch_only, lmstudio_only=lmstudio_only))
