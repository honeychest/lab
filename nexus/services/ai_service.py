import logging
import re
from config import settings

logger = logging.getLogger(__name__)

async def summarize_github(repo_info: dict) -> dict:
    """GitHub 레포 전용 요약. 실행방법을 최우선으로 강조."""
    prompt = _build_github_prompt(repo_info)
    return await _call_ai(prompt)


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


async def summarize(text: str, source_url: str) -> dict:
    prompt = _build_prompt(text, source_url)
    return await _call_ai(prompt)


async def _call_ai(prompt: str) -> dict:
    if settings.AI_PROVIDER == "gemini":
        return await _call_gemini(prompt)
    return await _call_claude(prompt)


async def _call_gemini(prompt: str) -> dict:
    from google import genai
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    models = ["gemini-3.1-flash-lite-preview","gemma-3-27b-it","gemma-3-12b-it","gemma-3-4b-it","gemma-3n-e2b-it","gemma-3-1b-it"]
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

def _build_prompt(text: str, source_url: str) -> str:
    return f"""아래 내용을 한국어로 요약하고 다음 양식으로 답해줘. 마크다운 굵게(**) 사용 금지. 쇼츠는 레시피는 중요하게 기록하고 나머진 그냥 3줄요약이면 돼.
          요약 양식:
          제목: (한 줄 핵심 주제)
            - 주요내용 내용 분량에 맞게 bullet 3~20개
            - 한 줄 결론
          내용:
          {text}
                  """

def _parse_response(text: str) -> dict:
    match = re.search(r'\*{0,2}제목:\*{0,2}\s*(.*)', text)
    title = match.group(1).strip() if match else ""
    logger.info(f"파싱된 제목: '{title}'")
    return {"title": title, "summary": text}