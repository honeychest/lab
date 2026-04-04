import logging
import re
from google.genai import types
from config import settings

logger = logging.getLogger(__name__)

YOUTUBE_MODELS = ["gemini-3.1-flash-lite-preview", "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-pro"]
LLM_MODELS     = ["gemma-3-27b-it", "gemma-3-12b-it", "gemma-3-4b-it", "gemma-3n-e2b-it", "gemma-3-1b-it"]


async def summarize_youtube(url: str) -> dict:
    """YouTube/Shorts URL을 Gemini에 직접 전달해 요약. AWS YouTube 차단 우회."""
    from google import genai
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    prompt = _build_youtube_prompt()
    for model in YOUTUBE_MODELS:
        try:
            response = await client.aio.models.generate_content(
                model=model,
                contents=[
                    types.Part(file_data=types.FileData(file_uri=url)),
                    prompt,
                ]
            )
            return _parse_response(response.text)
        except Exception as e:
            logger.warning(f"youtube 모델 {model} 실패: {e}")
    raise Exception("모든 youtube 모델 실패")


async def summarize(text: str, source_url: str) -> dict:
    """일반 텍스트 요약. llm_models 사용."""
    prompt = _build_prompt(text, source_url)
    return await _call_with_models(prompt, LLM_MODELS)


async def summarize_github(repo_info: dict) -> dict:
    """GitHub 레포 전용 요약. 실행방법을 최우선으로 강조."""
    prompt = _build_github_prompt(repo_info)
    return await _call_with_models(prompt, LLM_MODELS)


async def _call_with_models(prompt: str, models: list) -> dict:
    if settings.AI_PROVIDER == "gemini":
        return await _call_gemini(prompt, models)
    return await _call_claude(prompt)


async def _call_gemini(prompt: str, models: list) -> dict:
    from google import genai
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    for model in models:
        try:
            response = await client.aio.models.generate_content(
                model=model,
                contents=prompt
            )
            return _parse_response(response.text)
        except Exception as e:
            logger.warning(f"모델 {model} 실패: {e}")
    raise Exception("모든 모델 실패")


async def _call_claude(prompt: str) -> dict:
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )
    return _parse_response(message.content[0].text)

async def explain_word(text: str) -> dict:
    """단어/문장 설명. {"word": ..., "meaning_ko": ..., "example": ...} 반환."""
    prompt = f"""아래 단어나 문장을 설명해줘. 반드시 아래 형식으로만 답해. 다른 말 붙이지 마.
단어: (핵심 단어 또는 표현)
뜻: (품사별로 주요 의미 모두 나열. 어려운 개념은 비유나 쉬운 말로 풀어서. 형식: (품사) 의미 / (품사) 의미. 한국어, 한 줄)
예문: (가장 대표적인 용법의 영어 예문 1줄)

입력: {text}"""
    result = await _call_with_models(prompt, LLM_MODELS)
    return _parse_explain_response(result["summary"])


async def generate_quiz(word: str, meaning_ko: str, stage: int) -> str:
    """단계별 퀴즈 문제 생성."""
    if stage == 1:
        # 한글 뜻 + 영어 원어 설명을 보여주고 단어 입력
        prompt = f"""영단어 퀴즈 지문을 만들어줘. 조건을 반드시 지켜.
조건: 영어로 뜻을 쉽게 1줄 설명. 단어 자체 절대 포함 금지. 마크다운 금지. 설명 문장만 출력.
단어: {word}
뜻: {meaning_ko}"""

    elif stage == 2:
        # 영어 문장 빈칸 채우기
        prompt = f"""Make an English fill-in-the-blank sentence. Follow all conditions strictly.
Conditions: Only 1 blank. Only "{word}" fits naturally. Elementary school level. No markdown. Output the sentence only.
Format: Use _______ for the blank.
Word: {word}"""

    else:
        # 짧은 일상 한국어 상황 제시, 작문
        prompt = f"""영어 작문 퀴즈용 한국어 문장을 만들어줘. 조건을 반드시 지켜.
조건: 영어로 쓸 때 {word}를 자연스럽게 써야 하는 한국어 문장. {word} 외 다른 영단어로는 어색한 문장. 짧고 쉬운 한 문장 (25자 이내). 대화체. 복잡한 설명 금지. 영단어({word})와 뜻({meaning_ko}) 절대 포함 금지. 마크다운 금지.
단어: {word}
뜻: {meaning_ko}"""

    result = await _call_with_models(prompt, LLM_MODELS)
    return result["summary"].strip()


async def grade_writing(word: str, answer: str) -> dict:
    """작문 채점. {"used_correctly": bool, "context_ok": bool, "errors": [...]} 반환."""
    prompt = f"""아래 영어 작문을 채점해줘. 반드시 아래 형식으로만 답해.
사용여부: (yes/no) — "{word}"를 올바른 맥락으로 사용했는지
맥락: (yes/no) — 단어 없어도 의미 전달이 됐는지
오류: (문법 오류 목록, 없으면 "없음". 형식: "오류내용 → 수정내용" 한 줄씩)

단어: {word}
작문: {answer}"""
    result = await _call_with_models(prompt, LLM_MODELS)
    return _parse_grade_response(result["summary"])

def _parse_explain_response(text: str) -> dict:
    word = re.search(r'단어:\s*(.*)', text)
    meaning_ko = re.search(r'뜻:\s*(.*)', text)
    example = re.search(r'예문:\s*(.*)', text)
    return {
        "word": word.group(1).strip() if word else "",
        "meaning_ko": meaning_ko.group(1).strip() if meaning_ko else "",
        "example": example.group(1).strip() if example else "",
    }


def _parse_grade_response(text: str) -> dict:
    used = re.search(r'사용여부:\s*(yes|no)', text, re.IGNORECASE)
    context = re.search(r'맥락:\s*(yes|no)', text, re.IGNORECASE)
    errors_raw = re.search(r'오류:\s*([\s\S]*)', text)
    errors = []
    if errors_raw:
        raw = errors_raw.group(1).strip()
        if raw != "없음":
            errors = [e.strip() for e in raw.splitlines() if e.strip()]
    return {
        "used_correctly": used.group(1).lower() == "yes" if used else False,
        "context_ok": context.group(1).lower() == "yes" if context else False,
        "errors": errors,
    }


def _build_youtube_prompt() -> str:
    return """이 영상을 한국어로 요약해줘. 마크다운 굵게(**) 사용 금지. 쇼츠는 레시피는 중요하게 기록하고 나머진 그냥 3줄요약이면 돼.
요약 양식:
제목: (한 줄 핵심 주제)
  - 주요내용 내용 분량에 맞게 bullet 3~20개
  - 한 줄 결론"""


def _build_prompt(text: str, source_url: str) -> str:
    return f"""아래 내용을 한국어로 요약하고 다음 양식으로 답해줘. 마크다운 굵게(**) 사용 금지. 쇼츠는 레시피는 중요하게 기록하고 나머진 그냥 3줄요약이면 돼.
요약 양식:
제목: (한 줄 핵심 주제)
  - 주요내용 내용 분량에 맞게 bullet 3~20개
  - 한 줄 결론
내용:
{text}"""


def _build_github_prompt(repo_info: dict) -> str:
    readme_section = repo_info["readme"] if repo_info["has_readme"] else "(README 없음 — description으로만 요약)"
    return f"""아래 GitHub 레포지토리를 한국어로 요약해줘. 마크다운 굵게(**) 사용 금지.
답변 양식 (이 순서대로, 항목 생략 금지):

제목: (한 줄 핵심 목적)
실행방법: (설치 및 실행 명령어 포함 — 없으면 "README에 없음"으로 표시)
  - 사전요구사항: (Python 버전, Node, Docker 등 필요한 환경)
  - 설치: (pip install / npm install 등 실제 명령어)
  - 실행: (실제 실행 명령어)
주요기능:
  - (기능 bullet 최대 8개)
한 줄 결론: (이 레포를 써야 하는 이유 혹은 적합한 사용 사례)

레포 정보:
- 이름: {repo_info["name"]}
- 설명: {repo_info["description"]}
- 언어: {repo_info["language"]} | 별점: {repo_info["stars"]} | 라이선스: {repo_info["license"]}
- 토픽: {repo_info["topics"]}

README (앞 8000자):
{readme_section}
"""


def _parse_response(text: str) -> dict:
    match = re.search(r'\*{0,2}제목:\*{0,2}\s*(.*)', text)
    title = match.group(1).strip() if match else ""
    logger.info(f"파싱된 제목: '{title}'")
    return {"title": title, "summary": text}
