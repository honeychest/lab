"""
DRAFT 로그 래퍼
- 사전코딩 단계에서 비즈니스 로직 흐름을 한글로 기록
- 구현 완료 후에도 코드에 유지 (주석 역할 겸용)

활성화: .env 에 DLOG_ENABLED=true 추가
"""
import logging

from config import settings

logger = logging.getLogger("DRAFT")


def dlog(message: str) -> None:
    if not settings.DLOG_ENABLED:
        return
    logger.warning("[DRAFT] %s", message)
