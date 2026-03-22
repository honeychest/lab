import asyncio
import base64
import logging
import re
import json
import requests

from config import settings

logger = logging.getLogger(__name__)

_GITHUB_API = "https://api.github.com"


def _parse_github_url(url: str) -> tuple[str, str] | None:
    """
    다양한 GitHub URL 형태에서 (owner, repo) 추출.
    예) https://github.com/user/repo/tree/main/docs → ("user", "repo")
         github.com/user/repo.git → ("user", "repo")
    """
    # scheme 없는 URL 정규화
    normalized = url if url.startswith("http") else "https://" + url
    match = re.match(r'https?://github\.com/([^/?#]+)/([^/?#]+)', normalized)
    if not match:
        return None
    owner = match.group(1)
    repo = match.group(2).removesuffix(".git")
    return owner, repo


def _build_headers() -> dict:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"token {settings.GITHUB_TOKEN}"
    return headers


async def get_repo_info(url: str) -> dict:
    """
    GitHub API로 레포 메타데이터 + README 병렬 조회.

    URL → parse → (GET /repos/{owner}/{repo}, GET /repos/{owner}/{repo}/readme) 병렬
         ↓                ↓
       metadata         readme (base64 디코딩)
    """
    parsed = _parse_github_url(url)
    if not parsed:
        raise ValueError(f"GitHub URL 파싱 실패: {url}")
    owner, repo = parsed

    logger.info(f"GitHub 레포 조회 시작: {owner}/{repo}")
    headers = _build_headers()

    # 메타데이터 + README 병렬 조회
    meta_url = f"{_GITHUB_API}/repos/{owner}/{repo}"
    readme_url = f"{_GITHUB_API}/repos/{owner}/{repo}/readme"

    loop = asyncio.get_event_loop()
    meta_resp, readme_resp = await asyncio.gather(
        loop.run_in_executor(None, lambda: requests.get(meta_url, headers=headers, timeout=10)),
        loop.run_in_executor(None, lambda: requests.get(readme_url, headers=headers, timeout=10)),
    )

    # 메타데이터 처리
    if meta_resp.status_code == 404:
        raise requests.HTTPError("404: 레포를 찾을 수 없습니다", response=meta_resp)
    if meta_resp.status_code in (403, 429):
        retry_after = _parse_rate_limit(meta_resp)
        raise requests.HTTPError(f"rate_limit:{retry_after}", response=meta_resp)
    meta_resp.raise_for_status()

    try:
        meta = meta_resp.json()
    except (json.JSONDecodeError, ValueError) as e:
        logger.error(f"GitHub 메타데이터 JSON 파싱 실패: {e}")
        raise ValueError("GitHub API 응답 오류 (JSON 파싱 실패)")

    # README 처리 (없어도 계속 진행)
    readme_text = ""
    if readme_resp.status_code == 200:
        try:
            readme_data = readme_resp.json()
            encoded = readme_data.get("content", "")
            readme_text = base64.b64decode(encoded).decode("utf-8", errors="replace")
            readme_text = readme_text[:8000]  # 앞 8000자만 (UTF-8 문자 기준)
        except Exception as e:
            logger.warning(f"README 디코딩 실패, description만 사용: {e}")

    result = {
        "owner": owner,
        "repo": repo,
        "name": meta.get("full_name", f"{owner}/{repo}"),
        "description": meta.get("description") or "",
        "stars": meta.get("stargazers_count", 0),
        "language": meta.get("language") or "Unknown",
        "license": (meta.get("license") or {}).get("spdx_id") or "Unknown",
        "topics": ", ".join(meta.get("topics", [])),
        "readme": readme_text,
        "has_readme": bool(readme_text),
    }

    logger.info(f"GitHub 조회 완료: {result['name']}, ⭐{result['stars']}, {result['language']}, README={result['has_readme']}")
    return result


def _parse_rate_limit(response: requests.Response) -> int:
    """X-RateLimit-Reset 헤더에서 남은 초 계산. 없으면 3600 반환."""
    import time
    reset = response.headers.get("X-RateLimit-Reset")
    if reset:
        remaining = int(reset) - int(time.time())
        return max(remaining, 0)
    retry_after = response.headers.get("Retry-After")
    if retry_after:
        return int(retry_after)
    return 3600
