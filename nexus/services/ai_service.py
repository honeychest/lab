import logging
import re
from google.genai import types
from chs import dlog
from config import settings

logger = logging.getLogger(__name__)

GENAI_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-pro-latest", "gemini-3.1-flash-lite-preview", "gemini-2.5-flash-lite", "gemini-2.5-flash"]
QUIZ_MODELS  = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-pro-latest", "gemini-3.1-flash-lite-preview", "gemini-2.5-flash-lite", "gemini-2.5-flash"]


async def summarize_url(url: str) -> dict:
    """웹 URL을 Gemini url_context 툴로 직접 브라우징해 요약."""
    dlog("_build_url_prompt() 호출 — url 포함한 Gem 스타일 프롬프트 구성")
    prompt = _build_url_prompt(url)
    dlog("_call_gemini_url() 호출 — GENAI_MODELS 폴백 순서로 시도")
    result = await _call_gemini_url(prompt, GENAI_MODELS)
    dlog("파싱된 결과 dict 반환")
    return result


async def summarize_reddit(url: str) -> dict:
    """Reddit URL을 .json 엔드포인트로 직접 가져와 Gemini로 요약."""
    import httpx
    from urllib.parse import urlparse, urlunparse
    parsed = urlparse(url)
    # old.reddit.com으로 전환 + 쿼리 파라미터 제거 후 경로에 .json 추가
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
    comments_data = data[1]["data"]["children"]
    top_comments = []
    for c in comments_data[:10]:
        if c.get("kind") == "t1":
            body = c["data"].get("body", "")
            if body and body != "[deleted]":
                top_comments.append(body)

    content = f"제목: {title}\n\n본문:\n{selftext}\n\n상위 댓글:\n" + "\n---\n".join(top_comments)
    prompt = f"""아래 Reddit 게시글과 댓글을 한글로 요약해줘.

핵심 내용, 주요 논점, 댓글의 반응을 정리해줘.

응답 첫 줄을 반드시 "제목: (한 줄 핵심 주제)" 형식으로 시작해줘.

{content[:6000]}"""

    return await _call_with_models(prompt, GENAI_MODELS)


async def _call_gemini_url(prompt: str, models: list) -> dict:
    import asyncio
    import time
    from google import genai
    from google.genai import types as gtypes
    dlog("genai 클라이언트 생성")
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    dlog("url_context 툴 포함 GenerateContentConfig 구성")
    dlog("automatic_function_calling disable 설정")
    config = gtypes.GenerateContentConfig(
        tools=[gtypes.Tool(url_context=gtypes.UrlContext())],
        automatic_function_calling=gtypes.AutomaticFunctionCallingConfig(disable=True),
    )
    dlog("models 순서대로 폴백 — 30초 타임아웃 적용 (웹 브라우징 소요 시간 고려)")
    for model in models:
        t = time.time()
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config,
                ),
                timeout=30.0,
            )
            logger.info(f"[url] 사용 모델: {model} ({time.time() - t:.2f}s)")
            dlog("성공한 모델 응답 _parse_response() 후 반환")
            return _parse_response(response.text)
        except asyncio.TimeoutError:
            logger.warning(f"[url] 모델 {model} 타임아웃 ({time.time() - t:.2f}s) — 다음 모델 시도")
        except Exception as e:
            logger.warning(f"[url] 모델 {model} 실패 ({time.time() - t:.2f}s): {e}")
    dlog("모든 모델 실패 시 Exception 발생")
    raise Exception("모든 url 모델 실패")


def _build_url_prompt(url: str) -> str:
    dlog("Gem 스타일 지시문 반환 — 영어면 한글 요약 / 설치·설정·사용법·단축키 / 문서 사이트면 docs·API 탐색 포함")
    return f"""보내준 링크를 분석해서 다음 작업을 진행해줘.

영어로 된 내용인 경우에는 한글로 요약 정리를 해줘.

해당 내용이 무언가를 설명해주는 내용이라면 기능에 대한 자세한 설명과 사용하기 위한 설치법, 설정법, 사용법, 작성법, 단축키 등을 텍스트로 정리해줘.

해당 내용이 사이트라면 docs, api 등의 다른 카테고리까지 확인해서 설치법, 사용법 등에 대한 내용을 더 자세히 확인해줘.

응답 첫 줄을 반드시 "제목: (한 줄 핵심 주제)" 형식으로 시작해줘.

링크: {url}"""


async def summarize_youtube(url: str) -> dict:
    """YouTube/Shorts URL을 Gemini에 직접 전달해 요약. AWS YouTube 차단 우회."""
    from google import genai
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    prompt = _build_youtube_prompt()
    for model in GENAI_MODELS:
        try:
            response = await client.aio.models.generate_content(
                model=model,
                contents=[
                    types.Part(file_data=types.FileData(file_uri=url)),
                    prompt,
                ]
            )
            logger.info(f"[youtube] 사용 모델: {model}")
            return _parse_response(response.text)
        except Exception as e:
            logger.warning(f"youtube 모델 {model} 실패: {e}")
    raise Exception("모든 youtube 모델 실패")



async def summarize_github(repo_info: dict) -> dict:
    """GitHub 레포 전용 요약. 실행방법을 최우선으로 강조."""
    prompt = _build_github_prompt(repo_info)
    return await _call_with_models(prompt, GENAI_MODELS)


async def _call_with_models(prompt: str, models: list) -> dict:
    if settings.AI_PROVIDER == "gemini":
        return await _call_gemini(prompt, models)
    return await _call_claude(prompt)


async def _call_gemini(prompt: str, models: list) -> dict:
    import time
    from google import genai
    from google.genai import types as gtypes
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    afc_disabled = gtypes.GenerateContentConfig(
        automatic_function_calling=gtypes.AutomaticFunctionCallingConfig(disable=True)
    )
    for model in models:
        import asyncio
        t = time.time()
        try:
            dlog("8초 타임아웃 적용 — 초과 시 다음 모델 폴백")
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=afc_disabled,
                ),
                timeout=8.0,
            )
            logger.info(f"[llm] 사용 모델: {model} ({time.time() - t:.2f}s)")
            return _parse_response(response.text)
        except asyncio.TimeoutError:
            logger.warning(f"[llm] 모델 {model} 타임아웃 ({time.time() - t:.2f}s) — 다음 모델 시도")
        except Exception as e:
            logger.warning(f"[llm] 모델 {model} 실패 ({time.time() - t:.2f}s): {e}")
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
단어: (핵심 단어 또는 표현. make/take/have/do/pay/give 같은 light verb와 고정적으로 결합하는 명사라면 대표 동사구로 변환. 예: effort → make an effort, poll → take a poll, attention → pay attention to. 일반 동사·형용사·범용 명사는 원어 그대로.)
뜻: (품사별로 주요 의미 모두 나열. 어려운 개념은 비유나 쉬운 말로 풀어서. 형식: (품사) 의미 / (품사) 의미. 한국어, 한 줄)
예문: (가장 대표적인 용법의 영어 예문 1줄)

입력: {text}"""
    dlog("QUIZ_MODELS 사용")
    result = await _call_with_models(prompt, QUIZ_MODELS)
    return _parse_explain_response(result["summary"])


async def answer_law_query(law_result: str, query: str) -> dict:
    """MCP 체인 결과가 텔레그램 한도 초과 시 요약. {"title": ..., "summary": ...} 반환."""
    dlog("프롬프트 구성 — MCP 체인 결과를 컨텍스트로, 질문 기반 요약 요청")
    prompt = f"""아래는 법제처 법령 종합 조사 결과입니다.

{law_result[:30000]}

---
위 내용을 바탕으로 다음 질문에 한국어로 명확하고 이해하기 쉽게 답해줘.
조문을 인용할 때는 조문 번호를 함께 표시해줘.
관련 판례가 있다면 판결 요지도 함께 언급해줘.

질문: {query}"""

    return await _call_with_models(prompt, GENAI_MODELS)


def _has_invalid_content(text: str, word: str) -> bool:
    """생성된 퀴즈 문제에 단어, 마크다운, 빈칸 패턴이 포함되어 있으면 True."""
    if word.lower() in text.lower():
        return True
    if any(c in text for c in ("*", "#", "`")):
        return True
    if any(p in text for p in ("()", "( )", "___", "______")):
        return True
    return False


def _has_invalid_content_stage2(text: str, word: str) -> bool:
    dlog("stage2 검수 — word가 text에 포함되어 있으면 True 반환")
    if word.lower() in text.lower():
        return True
    dlog("stage2 검수 — _______ 빈칸이 없으면 True 반환")
    if "_______" not in text:
        return True
    dlog("stage2 검수 — 마크다운 기호 포함 시 True 반환")
    if any(c in text for c in ("*", "#", "`")):
        return True
    dlog("bool 반환 — generate_quiz() stage2 분기에서 재시도 여부 판단에 사용")
    return False


def _force_clean(text: str, word: str, stage: int = 3) -> str:
    """3회 실패 fallback — 프로그램 수준에서 문제 있는 요소 강제 제거."""
    dlog("_force_clean() — stage 파라미터 추가")
    dlog("stage 2 마크다운 제거 후 빈칸 없으면 word를 _______ 로 치환 후 반환")
    if stage == 2:
        result = re.sub(r'[*#`]', "", text)
        if "_______" not in result:
            result = re.sub(re.escape(word), "_______", result, count=1, flags=re.IGNORECASE)
        dlog("_______가 있어도 word 잔존 시 제거")
        dlog("_______를 공백으로 치환한 임시 text에서 word 포함 여부 확인")
        text_without_blank = result.replace("_______", "")
        dlog("word 잔존 시 re.sub으로 word 제거 후 strip")
        if word.lower() in text_without_blank.lower():
            result = re.sub(re.escape(word), "", result, flags=re.IGNORECASE).strip()
        return result.strip()
    dlog("stage 2 외: 기존 로직 실행 후 반환")
    # 단어 치환 (외래어 등 AI가 포함하는 케이스)
    result = re.sub(re.escape(word), "___", text, flags=re.IGNORECASE)
    # 마크다운 기호 제거
    result = re.sub(r'[*#`]', "", result)
    # 빈칸 패턴 통일
    result = re.sub(r'\(\s*\)|_{2,}', "___", result)
    return result.strip()


async def generate_quiz(word: str, meaning_ko: str, stage: int) -> str:
    """단계별 퀴즈 문제 생성."""
    if stage == 1:
        prompt = f"""영단어 퀴즈 지문을 만들어줘. 조건을 반드시 지켜.
조건: 영어로 뜻을 쉽게 1줄 설명. 단어 자체 절대 포함 금지. 마크다운 금지. 설명 문장만 출력.
단어: {word}
뜻: {meaning_ko}"""

    elif stage == 2:
        dlog("stage2 프롬프트 — 빈칸 외 문장에서 word 출현 금지 조건 추가")
        prompt = f"""Make an English fill-in-the-blank sentence. Follow all conditions strictly.
Conditions: Only 1 blank. Only "{word}" fits naturally. Elementary school level. No markdown. Output the sentence only. Do NOT use the word "{word}" anywhere in the sentence except as the blank (_______).
Format: Use _______ for the blank.
Word: {word}"""

    else:
        dlog("stage3 프롬프트 — 한국어 음역 사용 금지 조건 추가")
        dlog("한국어 문장에 영단어 절대 포함 금지 조건 추가")
        prompt = f"""너는 영어 단어 학습 퀴즈 출제자야. 학습자는 "{word}"라는 단어를 모르는 상태로 문제를 풀어.
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

    last = ""
    current_prompt = prompt
    for attempt in range(3):
        dlog("QUIZ_MODELS 사용")
        result = await _call_with_models(current_prompt, QUIZ_MODELS)
        dlog("재시도 시 실패 원인 포함한 수정 프롬프트 전송")
        raw = result["summary"].strip()
        dlog("상황 파싱 stage >= 3 — 3단계 이상 모두 적용")
        if stage >= 3:
            m = re.search(r'상황[:：]\s*(.+)', raw)
            last = m.group(1).strip() if m else raw
        else:
            last = raw
        dlog("검수 조건 — stage별 분기")
        dlog("stage 1: word 포함 여부만 검수, 통과 시 반환")
        if stage == 1 and word.lower() not in last.lower():
            return last
        dlog("stage 2: _has_invalid_content_stage2() 검수, 통과 시 반환")
        if stage == 2 and not _has_invalid_content_stage2(last, word):
            return last
        dlog("stage 3+: 기존 _has_invalid_content() 검수, 통과 시 반환")
        if stage >= 3 and not _has_invalid_content(last, word):
            return last
        logger.warning(f"[generate_quiz] 재시도 {attempt + 1}/3 — 검수 실패: {last!r}")
        dlog("검수 실패 원인 분석 — 단어 포함 여부 / 빈칸 포함 여부 확인")
        dlog("검수 실패 원인 분석 — stage 2는 빈칸 없음을 별도 실패 사유로 추가")
        reasons = []
        if word.lower() in last.lower():
            reasons.append(f"단어 '{word}'가 그대로 포함됨")
        if stage == 2 and "_______" not in last:
            reasons.append("빈칸(_______)이 없음")
        if stage != 2 and any(p in last for p in ("()", "( )", "___", "______")):
            reasons.append("빈칸(___) 또는 괄호가 포함됨")
        if any(c in last for c in ("*", "#", "`")):
            reasons.append("마크다운 기호가 포함됨")
        feedback = " / ".join(reasons) if reasons else "형식 오류"
        dlog("실패 응답과 원인을 포함한 수정 프롬프트 구성")
        current_prompt = f"{prompt}\n\n[이전 응답 오류] 이전 응답: \"{last}\" → 문제: {feedback}. 위 규칙을 다시 확인하고 올바른 형식으로만 출력해."

    # TODO: [generate_quiz] 3회 재시도 실패 — 프롬프트 또는 모델 개선 필요
    # 원인: AI가 단어를 외래어로 인식하거나 형식 지시를 반복 무시함
    # 임시처리: 단어/마크다운/빈칸 강제 치환 후 반환
    dlog("_force_clean(last, word, stage) — stage 전달")
    cleaned = _force_clean(last, word, stage)
    logger.warning(
        f"[generate_quiz] 3회 실패 — 강제 치환 적용. 단어: {word!r}, 원본: {last!r}, 결과: {cleaned!r}. "
        f"근본 해결 필요: 프롬프트 개선 또는 더 강한 모델 사용 권장."
    )
    return cleaned


async def generate_quiz_with_hint(word: str, meaning_ko: str, stage: int) -> tuple:
    import asyncio
    dlog("asyncio.gather로 generate_quiz()와 get_word_definition() 동시 실행")
    question, definition = await asyncio.gather(
        generate_quiz(word, meaning_ko, stage),
        get_word_definition(word),
    )
    dlog("(question, definition) 튜플 반환 — _prefetch_next_question에서 사용")
    return question, definition


async def get_word_definition(word: str) -> str:
    dlog(f"get_word_definition({word}) 호출 — 힌트용 영어 정의 1줄 생성")
    dlog("프롬프트 구성 — 단어의 영어 정의를 간결한 1줄로 요청")
    prompt = f"Give a dictionary definition of '{word}' in 10 words or fewer. Do not use the word '{word}' or any of its forms. Only the definition, no extra text."
    dlog("_call_with_models() 호출")
    dlog("QUIZ_MODELS 사용")
    result = await _call_with_models(prompt, QUIZ_MODELS)
    dlog("응답 텍스트 그대로 반환 — quiz:hint에서 힌트 메시지에 포함")
    return result["summary"].strip()


async def grade_writing(word: str, meaning_ko: str, question: str, answer: str) -> dict:
    """작문 채점. {"used_correctly": bool, "context_ok": bool, "grammar_errors": [...], "collocation_errors": [...]} 반환."""
    dlog("question(한국어 문장) 기준 채점 — 단어 포함 + 의미 전달이면 yes, 문법오류는 오류항목으로만")
    dlog("grade_writing 프롬프트")
    dlog("오류 기준 — 명백한 문법 규칙 위반만, 스타일 제안·다른 단어 선택은 오류 아님 명시")
    dlog("유형 정비 — 동명사 제거 / 접속사 추가 / 불완전문장(주어·목적어·필수보어 누락) 명시")
    dlog("연어 기준 — {word} 포함 관용적 단어 조합만, 문장 교정·문장 보완은 연어 아님 명시")
    dlog("오류 최대 3개 제한 명시")
    dlog("대안표현 항목 추가 — 오류 없을 때만 비슷한 표현 1~2개, 오류 있으면 없음")
    prompt = f"""아래 영어 작문을 채점해줘. 반드시 아래 형식으로만 답해.
사용여부: (yes/no) — "{word}"를 포함해서 아래 한국어 문장의 의미를 영어로 전달했는지. 시제·관사·단복수 같은 문법 오류가 있어도 의미가 전달되면 yes.
맥락: (yes/no) — 단어 없어도 의미 전달이 됐는지
오류: (명백한 문법 규칙 위반만. 더 자연스러운 표현이나 다른 단어 선택은 오류가 아님. 없으면 "없음". 최대 3개.
  형식: "[유형] 오류내용 → 수정내용" 한 줄씩. 반드시 대괄호 사용.
  유형은 반드시 아래 중 하나: 관사 / 단복수 / 전치사 / 동사원형 / 시제 / 어순 / 철자 / 접속사 / 연어
  주어·목적어·필수 보어 누락도 오류로 신고.
  연어는 "{word}"가 포함된 관용적 단어 조합만. 문장 교정이나 문장 보완은 연어에 포함하지 않음.
  예시: [시제] He was underwent change → He underwent change)
대안표현: (오류 없을 때만. 작문과 비슷한 의미의 다른 표현 1~2개를 "/" 로 구분. 오류 있으면 "없음".)

한국어 문장: {question}
단어: {word}
뜻: {meaning_ko}
작문: {answer}"""
    dlog("QUIZ_MODELS 사용")
    result = await _call_with_models(prompt, QUIZ_MODELS)
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


COLLOCATION_TYPE = "연어"

def _parse_grade_response(text: str) -> dict:
    used = re.search(r'사용여부:\s*(yes|no)', text, re.IGNORECASE)
    context = re.search(r'맥락:\s*(yes|no)', text, re.IGNORECASE)
    errors_raw = re.search(r'오류:\s*([\s\S]*?)(?=\n대안표현:|$)', text)
    grammar_errors = []   # [{"type": "관사", "detail": "habit → a habit"}, ...]
    collocation_errors = []  # ["making an effort", ...]  (수정된 표현만 추출)
    if errors_raw:
        raw = errors_raw.group(1).strip()
        if raw != "없음":
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                m = re.match(r'\[(.+?)\]\s*(.*)', line)
                if m:
                    error_type = m.group(1).strip()
                    detail = m.group(2).strip()
                    if error_type == COLLOCATION_TYPE:
                        # "오류표현 → 올바른표현" 에서 올바른표현 추출
                        parts = detail.split("→")
                        collocation_errors.append(parts[1].strip() if len(parts) > 1 else detail)
                    else:
                        grammar_errors.append({"type": error_type, "detail": detail})
                else:
                    # 유형 태그 없는 경우 grammar로 처리
                    grammar_errors.append({"type": "기타", "detail": line})
    dlog("대안표현 필드 파싱 — '대안표현:' 항목 추출, 없으면 빈 리스트")
    alternatives_raw = re.search(r'대안표현:\s*(.*)', text)
    dlog("'/' 구분자로 개별 표현 분리")
    alternatives = []
    if alternatives_raw:
        raw_alt = alternatives_raw.group(1).strip()
        if raw_alt and raw_alt != "없음":
            alternatives = [a.strip() for a in raw_alt.split("/") if a.strip()]
    return {
        "used_correctly": used.group(1).lower() == "yes" if used else False,
        "context_ok": context.group(1).lower() == "yes" if context else False,
        "grammar_errors": grammar_errors,
        "collocation_errors": collocation_errors,
        "alternatives": alternatives,
    }


def _build_youtube_prompt() -> str:
    return """이 영상을 한국어로 요약해줘. 마크다운 굵게(**) 사용 금지. 쇼츠는 레시피는 중요하게 기록하고 나머진 그냥 3줄요약이면 돼.
요약 양식:
제목: (한 줄 핵심 주제)
  - 주요내용 내용 분량에 맞게 bullet 3~20개
  - 한 줄 결론"""



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
