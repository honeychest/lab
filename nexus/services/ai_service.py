"""
AI 도메인 함수. 프롬프트 구성 + model_runner 호출 + 결과 파싱만 담당.
"""
import logging
import re

from services import model_runner
from services.ai_parsers import (
    parse_explain_response,
    parse_grade_response,
    has_invalid_content,
    has_invalid_content_stage2,
    force_clean,
)

logger = logging.getLogger(__name__)


# ── URL / 콘텐츠 요약 ──────────────────────────────────────────────────────────

async def summarize_url(url: str) -> dict:
    from services import webpage_service
    try:
        content = await webpage_service.get_content(url)
        prompt = _url_prompt_with_content(url, content)
        return await model_runner.run(prompt, timeout=30.0)
    except Exception as e:
        logger.warning(f"[url] fetch 체인 전체 실패: {e} — Gemini UrlContext 폴백")
        return await model_runner.run_url_context(_url_prompt_gemini(url), timeout=30.0)


async def summarize_youtube(url: str) -> dict:
    return await model_runner.run_youtube(url, _youtube_prompt())


async def summarize_github(repo_info: dict) -> dict:
    return await model_runner.run(_github_prompt(repo_info))


async def summarize_reddit(url: str) -> dict:
    content = await _fetch_reddit_content(url)
    prompt = f"""아래 Reddit 게시글과 댓글을 한글로 요약해줘.

핵심 내용, 주요 논점, 댓글의 반응을 정리해줘.

응답 첫 줄을 반드시 "제목: (한 줄 핵심 주제)" 형식으로 시작해줘.

{content[:6000]}"""
    return await model_runner.run(prompt)


async def answer_law_query(law_result: str, query: str) -> dict:
    prompt = f"""아래는 법제처 법령 종합 조사 결과입니다.

{law_result[:30000]}

---
위 내용을 바탕으로 다음 질문에 한국어로 명확하고 이해하기 쉽게 답해줘.
조문을 인용할 때는 조문 번호를 함께 표시해줘.
관련 판례가 있다면 판결 요지도 함께 언급해줘.

질문: {query}"""
    return await model_runner.run(prompt)


# ── 단어 학습 ─────────────────────────────────────────────────────────────────

async def explain_word(text: str) -> dict:
    prompt = f"""아래 단어나 문장을 설명해줘. 반드시 아래 형식으로만 답해. 다른 말 붙이지 마.
단어: (핵심 단어 또는 표현. make/take/have/do/pay/give 같은 light verb와 고정적으로 결합하는 명사라면 대표 동사구로 변환. 예: effort → make an effort, poll → take a poll, attention → pay attention to. 일반 동사·형용사·범용 명사는 원어 그대로.)
뜻: (품사별로 주요 의미 모두 나열. 어려운 개념은 비유나 쉬운 말로 풀어서. 형식: (품사) 의미 / (품사) 의미. 한국어, 한 줄)
예문: (가장 대표적인 용법의 영어 예문 1줄)

입력: {text}"""
    result = await model_runner.run(prompt)
    return parse_explain_response(result["summary"])


async def get_word_definition(word: str) -> str:
    prompt = f"Give a dictionary definition of '{word}' in 10 words or fewer. Do not use the word '{word}' or any of its forms. Only the definition, no extra text."
    result = await model_runner.run(prompt)
    return result["summary"].strip()


async def generate_quiz(word: str, meaning_ko: str, stage: int) -> str:
    """단계별 퀴즈 문제 생성. 3회 재시도 후 force_clean 적용."""
    prompt = _quiz_prompt(word, meaning_ko, stage)
    current_prompt = prompt
    last = ""

    for attempt in range(3):
        result = await model_runner.run(current_prompt)
        raw = result["summary"].strip()

        if stage >= 3:
            m = re.search(r'상황[:：]\s*(.+)', raw)
            last = m.group(1).strip() if m else raw
        else:
            last = raw

        if stage == 1 and word.lower() not in last.lower():
            return last
        if stage == 2 and not has_invalid_content_stage2(last, word):
            return last
        if stage >= 3 and not has_invalid_content(last, word):
            return last

        logger.warning(f"[generate_quiz] 재시도 {attempt + 1}/3 — 검수 실패: {last!r}")
        reasons = _quiz_failure_reasons(last, word, stage)
        feedback = " / ".join(reasons) if reasons else "형식 오류"
        current_prompt = f"{prompt}\n\n[이전 응답 오류] 이전 응답: \"{last}\" → 문제: {feedback}. 위 규칙을 다시 확인하고 올바른 형식으로만 출력해."

    cleaned = force_clean(last, word, stage)
    logger.warning(
        f"[generate_quiz] 3회 실패 — 강제 치환 적용. 단어: {word!r}, 원본: {last!r}, 결과: {cleaned!r}. "
        f"근본 해결 필요: 프롬프트 개선 또는 더 강한 모델 사용 권장."
    )
    return cleaned


async def generate_quiz_with_hint(word: str, meaning_ko: str, stage: int) -> tuple:
    import asyncio
    question, definition = await asyncio.gather(
        generate_quiz(word, meaning_ko, stage),
        get_word_definition(word),
    )
    return question, definition


async def grade_writing(word: str, meaning_ko: str, question: str, answer: str) -> dict:
    from services.prompts import grade_writing as grade_writing_prompt
    prompt = grade_writing_prompt(word, meaning_ko, question, answer)
    result = await model_runner.run(prompt)
    return parse_grade_response(result["summary"])


# ── 프롬프트 빌더 ─────────────────────────────────────────────────────────────

def _url_prompt_gemini(url: str) -> str:
    return f"""보내준 링크를 분석해서 한글로 요약해줘.
설명/문서라면 기능·설치법·설정법·사용법·단축키 등을 정리해줘.
응답 첫 줄을 반드시 "제목: (한 줄 핵심 주제)" 형식으로 시작해줘.
링크: {url}"""


def _url_prompt_with_content(url: str, content: str) -> str:
    return f"""아래 웹페이지 내용을 분석해줘.

영어로 된 내용이면 한글로 요약해줘.
설명/문서라면 기능·설치법·설정법·사용법·단축키 등을 텍스트로 정리해줘.
응답 첫 줄을 반드시 "제목: (한 줄 핵심 주제)" 형식으로 시작해줘.

링크: {url}

내용:
{content[:8000]}"""


def _youtube_prompt() -> str:
    return """이 영상을 한국어로 요약해줘. 마크다운 굵게(**) 사용 금지. 쇼츠는 레시피는 중요하게 기록하고 나머진 그냥 3줄요약이면 돼.
요약 양식:
제목: (한 줄 핵심 주제)
  - 주요내용 내용 분량에 맞게 bullet 3~20개
  - 한 줄 결론"""


def _github_prompt(repo_info: dict) -> str:
    readme = repo_info["readme"] if repo_info["has_readme"] else "(README 없음 — description으로만 요약)"
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
{readme}
"""


def _quiz_prompt(word: str, meaning_ko: str, stage: int) -> str:
    if stage == 1:
        return f"""영단어 퀴즈 지문을 만들어줘. 조건을 반드시 지켜.
조건: 영어로 뜻을 쉽게 1줄 설명. 단어 자체 절대 포함 금지. 마크다운 금지. 설명 문장만 출력.
단어: {word}
뜻: {meaning_ko}"""

    if stage == 2:
        return f"""Make an English fill-in-the-blank sentence. Follow all conditions strictly.
Conditions: Only 1 blank. Only "{word}" fits naturally. Elementary school level. No markdown. Output the sentence only. Do NOT use the word "{word}" anywhere in the sentence except as the blank (_______).
Format: Use _______ for the blank.
Word: {word}"""

    return f"""너는 영어 단어 학습 퀴즈 출제자야. 학습자는 "{word}"라는 단어를 모르는 상태로 문제를 풀어.
아래 단어를 영어 작문에 정확한 품사로 써야만 자연스러운 한국어 상황 문장을 만들어줘.

규칙:
- 뜻({meaning_ko})에 표기된 품사에 맞는 상황. 예) 형용사면 명사 수식 상황, 동사면 행동 상황.
- "{word}" 외 다른 영단어로는 어색한 상황.
- 25자 이내 짧은 대화체.
- 빈칸·괄호·밑줄 사용 금지.
- 마크다운 금지.
- 한국어 문장에 영단어 절대 포함 금지. (영어 알파벳 사용 금지)

반드시 아래 형식으로만 출력해. 다른 말 일절 금지.
상황: (완성된 한국어 문장)

단어: {word} / 뜻: {meaning_ko}"""


def _quiz_failure_reasons(last: str, word: str, stage: int) -> list[str]:
    reasons = []
    if word.lower() in last.lower():
        reasons.append(f"단어 '{word}'가 그대로 포함됨")
    if stage == 2 and "_______" not in last:
        reasons.append("빈칸(_______)이 없음")
    if stage != 2 and any(p in last for p in ("()", "( )", "___", "______")):
        reasons.append("빈칸(___) 또는 괄호가 포함됨")
    if any(c in last for c in ("*", "#", "`")):
        reasons.append("마크다운 기호가 포함됨")
    return reasons


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────

async def _fetch_reddit_content(url: str) -> str:
    import httpx
    from urllib.parse import urlparse, urlunparse

    parsed = urlparse(url)
    clean_path = parsed.path.rstrip("/") + ".json"
    json_url = urlunparse(parsed._replace(netloc="old.reddit.com", path=clean_path, query="", fragment=""))
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(json_url, headers=headers, follow_redirects=True, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()

    post = data[0]["data"]["children"][0]["data"]
    title = post.get("title", "")
    selftext = post.get("selftext", "")
    top_comments = []
    for c in data[1]["data"]["children"][:10]:
        if c.get("kind") == "t1":
            body = c["data"].get("body", "")
            if body and body != "[deleted]":
                top_comments.append(body)

    return f"제목: {title}\n\n본문:\n{selftext}\n\n상위 댓글:\n" + "\n---\n".join(top_comments)
