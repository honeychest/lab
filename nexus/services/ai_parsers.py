"""
AI 응답 파싱·검증 순수 함수 모음.
LLM 호출 없이 단위 테스트 가능.
"""
import re

# ── 공통 응답 파싱 ─────────────────────────────────────────────────────────────

def parse_response(text: str) -> dict:
    match = re.search(r'\*{0,2}제목:\*{0,2}\s*(.*)', text)
    title = match.group(1).strip() if match else ""
    return {"title": title, "summary": text}


def parse_explain_response(text: str) -> dict:
    word       = re.search(r'단어:\s*(.*)', text)
    meaning_ko = re.search(r'뜻:\s*(.*)', text)
    example    = re.search(r'예문:\s*(.*)', text)
    return {
        "word":       word.group(1).strip()       if word       else "",
        "meaning_ko": meaning_ko.group(1).strip() if meaning_ko else "",
        "example":    example.group(1).strip()    if example    else "",
    }


_COLLOCATION_TYPE = "연어"

def parse_grade_response(text: str) -> dict:
    used       = re.search(r'사용여부:\s*(yes|no)', text, re.IGNORECASE)
    context    = re.search(r'맥락:\s*(yes|no)', text, re.IGNORECASE)
    errors_raw = re.search(r'오류:\s*([\s\S]*?)(?=\n대안표현:|$)', text)

    grammar_errors: list[dict]  = []
    collocation_errors: list[str] = []

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
                    detail     = m.group(2).strip()
                    if error_type == _COLLOCATION_TYPE:
                        parts = detail.split("→")
                        collocation_errors.append(parts[1].strip() if len(parts) > 1 else detail)
                    else:
                        grammar_errors.append({"type": error_type, "detail": detail})
                else:
                    grammar_errors.append({"type": "기타", "detail": line})

    alternatives_raw = re.search(r'대안표현:\s*(.*)', text)
    alternatives: list[str] = []
    if alternatives_raw:
        raw_alt = alternatives_raw.group(1).strip()
        if raw_alt and raw_alt != "없음":
            alternatives = [a.strip() for a in raw_alt.split("/") if a.strip()]

    return {
        "used_correctly":    used.group(1).lower() == "yes" if used    else False,
        "context_ok":        context.group(1).lower() == "yes" if context else False,
        "grammar_errors":    grammar_errors,
        "collocation_errors": collocation_errors,
        "alternatives":      alternatives,
    }


# ── 퀴즈 생성 검증 ─────────────────────────────────────────────────────────────

def has_invalid_content(text: str, word: str) -> bool:
    """stage 1/3+ 퀴즈 검수 — 단어 노출, 마크다운, 빈칸 패턴 검사."""
    if word.lower() in text.lower():
        return True
    if any(c in text for c in ("*", "#", "`")):
        return True
    if any(p in text for p in ("()", "( )", "___", "______")):
        return True
    return False


def has_invalid_content_stage2(text: str, word: str) -> bool:
    """stage 2 퀴즈 검수 — 단어 노출, 빈칸 누락, 마크다운 검사."""
    if word.lower() in text.lower():
        return True
    if "_______" not in text:
        return True
    if any(c in text for c in ("*", "#", "`")):
        return True
    return False


def force_clean(text: str, word: str, stage: int = 3) -> str:
    """3회 재시도 실패 후 fallback — 문제 있는 요소를 프로그램 수준에서 강제 제거."""
    if stage == 2:
        result = re.sub(r'[*#`]', "", text)
        if "_______" not in result:
            result = re.sub(re.escape(word), "_______", result, count=1, flags=re.IGNORECASE)
        text_without_blank = result.replace("_______", "")
        if word.lower() in text_without_blank.lower():
            result = re.sub(re.escape(word), "", result, flags=re.IGNORECASE).strip()
        return result.strip()

    result = re.sub(re.escape(word), "___", text, flags=re.IGNORECASE)
    result = re.sub(r'[*#`]', "", result)
    result = re.sub(r'\(\s*\)|_{2,}', "___", result)
    return result.strip()
