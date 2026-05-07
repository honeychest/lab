"""
모델 가용성 및 품질 테스트.
url_context 브라우징 + quiz 함수(explain_word, generate_quiz stage 1/2/3)를 전체 모델 대상으로 테스트합니다.

실행 방법 (nexus/ 디렉토리에서):
    python tests/debug_model_availability.py --list
    python tests/debug_model_availability.py
    python tests/debug_model_availability.py "https://example.com"
    python tests/debug_model_availability.py "https://example.com" "nexus" "(명사) 연결, 핵심 연결점"
"""
import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google import genai
from google.genai import types as gtypes
from config import settings

# ── url_context 테스트 모델 목록 ─────────────────────────────────
URL_MODELS = [
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite",
    "gemini-pro-latest",
    "gemini-flash-latest",
    "gemini-flash-lite-latest"
]

# ── quiz 테스트 모델 목록 ────────────────────────────────────────
QUIZ_MODELS = [
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite",
    "gemini-pro-latest",
    "gemini-flash-latest",
    "gemini-flash-lite-latest"
]
# ────────────────────────────────────────────────────────────────

DEFAULT_URL     = "https://www.google.com"
DEFAULT_WORD    = "nexus"
DEFAULT_MEANING = "(명사) 연결, 핵심 연결점"


async def call_model(client: genai.Client, model: str, prompt: str, use_url_context: bool = False) -> dict:
    config_kwargs = dict(
        automatic_function_calling=gtypes.AutomaticFunctionCallingConfig(disable=True)
    )
    if use_url_context:
        config_kwargs["tools"] = [gtypes.Tool(url_context=gtypes.UrlContext())]

    config  = gtypes.GenerateContentConfig(**config_kwargs)
    timeout = 40.0 if use_url_context else 30.0
    t       = time.time()
    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model, contents=prompt, config=config,
            ),
            timeout=timeout,
        )
        return {"ok": True, "elapsed": time.time() - t, "response": response.text.strip()}
    except asyncio.TimeoutError:
        return {"ok": False, "elapsed": time.time() - t, "error": "TIMEOUT"}
    except Exception as e:
        return {"ok": False, "elapsed": time.time() - t, "error": str(e)[:120]}


def print_result(model: str, result: dict, response_limit: int = 200) -> None:
    if result["ok"]:
        print(f"  ✔  {model} ({result['elapsed']:.2f}s)")
        for line in result["response"][:response_limit].splitlines():
            print(f"     {line}")
    else:
        print(f"  ✘  {model} ({result['elapsed']:.2f}s) → {result['error']}")


def section(title: str, sub: str = "") -> None:
    print(f"\n{'─'*60}")
    print(f"  {title}")
    if sub:
        print(f"  {sub}")
    print(f"{'─'*60}")


async def list_models(client: genai.Client) -> None:
    print(f"\n{'='*60}")
    print("  사용 가능한 모델 목록")
    print(f"{'='*60}")
    models = [m async for m in await client.aio.models.list()]
    for m in sorted(models, key=lambda x: x.name):
        print(f"  {m.name}")
    print(f"\n총 {len(models)}개\n")


async def run_url_context(client: genai.Client, url: str) -> None:
    prompt = f"이 URL의 제목을 한 줄로 말해줘. 링크: {url}"
    section("[1] url_context", f"URL: {url}")
    for model in URL_MODELS:
        result = await call_model(client, model, prompt, use_url_context=True)
        print_result(model, result)


async def run_quiz(client: genai.Client, word: str, meaning_ko: str) -> None:
    explain_prompt = f"""아래 단어나 문장을 설명해줘. 반드시 아래 형식으로만 답해. 다른 말 붙이지 마.
단어: (핵심 단어 또는 표현)
뜻: (품사별로 주요 의미. 한국어, 한 줄)
예문: (가장 대표적인 용법의 영어 예문 1줄)

입력: {word}"""

    stage1_prompt = f"""영단어 퀴즈 지문을 만들어줘. 조건을 반드시 지켜.
조건: 영어로 뜻을 쉽게 1줄 설명. 단어 자체 절대 포함 금지. 마크다운 금지. 설명 문장만 출력.
단어: {word}
뜻: {meaning_ko}"""

    stage2_prompt = f"""Make an English fill-in-the-blank sentence. Follow all conditions strictly.
Conditions: Only 1 blank. Only "{word}" fits naturally. Elementary school level. No markdown. Output the sentence only.
Format: Use _______ for the blank.
Word: {word}"""

    stage3_prompt = f"""너는 영어 단어 학습 퀴즈 출제자야. 학습자는 "{word}"라는 단어를 모르는 상태로 문제를 풀어.
아래 단어를 영어 작문에 정확한 품사로 써야만 자연스러운 한국어 상황 문장을 만들어줘.

규칙:
- 뜻({meaning_ko})에 표기된 품사에 맞는 상황.
- "{word}" 외 다른 영단어로는 어색한 상황.
- 25자 이내 짧은 대화체.
- 빈칸·괄호·밑줄 사용 금지.
- 마크다운 금지.
- 한국어 문장에 영단어 절대 포함 금지. (영어 알파벳 사용 금지)

반드시 아래 형식으로만 출력해. 다른 말 일절 금지.
상황: (완성된 한국어 문장)

단어: {word} / 뜻: {meaning_ko}"""

    for label, prompt in [
        ("[2] explain_word", explain_prompt),
        ("[3] generate_quiz stage1 — 영어 뜻 설명", stage1_prompt),
        ("[4] generate_quiz stage2 — 빈칸 채우기", stage2_prompt),
        ("[5] generate_quiz stage3 — 한국어 상황 문장", stage3_prompt),
    ]:
        section(label, f"word={word}, meaning={meaning_ko}")
        for model in QUIZ_MODELS:
            result = await call_model(client, model, prompt)
            print_result(model, result)


async def main(url: str, word: str, meaning_ko: str) -> None:
    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    print(f"\n{'='*60}")
    print("  모델 가용성 및 품질 테스트")
    print(f"{'='*60}")

    await run_url_context(client, url)
    await run_quiz(client, word, meaning_ko)

    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--list":
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        asyncio.run(list_models(client))
    else:
        url        = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
        word       = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_WORD
        meaning_ko = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_MEANING
        asyncio.run(main(url, word, meaning_ko))
