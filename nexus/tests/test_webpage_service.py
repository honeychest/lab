"""webpage_service.get_content 단위 테스트 — requests mock 사용."""
import importlib
import logging
import sys
import unittest
from unittest.mock import MagicMock, patch

# 다른 테스트 파일이 MagicMock으로 등록했을 수 있으므로 강제로 실제 모듈 재로드
sys.modules.pop("services.webpage_service", None)
import services.webpage_service as webpage_mod
importlib.reload(webpage_mod)

from services.webpage_service import get_content

logger = logging.getLogger(__name__)


def _make_response(html: str, status: int = 200):
    resp = MagicMock()
    resp.status_code = status
    resp.text = html
    resp.raise_for_status = MagicMock()
    return resp


class TestGetContent(unittest.IsolatedAsyncioTestCase):

    @patch("services.webpage_service.requests.Session")
    async def test_basic_text_extraction(self, mock_session_cls):
        html = "<html><body><p>안녕하세요 테스트 내용입니다.</p></body></html>"
        mock_session = MagicMock()
        mock_session.get.return_value = _make_response(html)
        mock_session_cls.return_value = mock_session

        result = await get_content("https://example.com")
        logger.info(f"기본 텍스트 추출 → 길이: {len(result)}, 내용: '{result[:50]}'")
        self.assertIn("안녕하세요 테스트 내용입니다.", result)

    @patch("services.webpage_service.requests.Session")
    async def test_script_style_removed(self, mock_session_cls):
        html = """
        <html><body>
          <script>alert('xss')</script>
          <style>.body { color: red }</style>
          <p>실제 내용만 남아야 합니다.</p>
        </body></html>
        """
        mock_session = MagicMock()
        mock_session.get.return_value = _make_response(html)
        mock_session_cls.return_value = mock_session

        result = await get_content("https://example.com")
        logger.info(f"script/style 제거 확인 → 결과: '{result[:100]}'")
        self.assertNotIn("alert", result)
        self.assertNotIn("color: red", result)
        self.assertIn("실제 내용만 남아야 합니다.", result)

    @patch("services.webpage_service.requests.Session")
    async def test_nav_footer_removed(self, mock_session_cls):
        html = """
        <html><body>
          <nav>메뉴 링크들</nav>
          <header>헤더 영역</header>
          <p>본문 내용입니다.</p>
          <footer>푸터 영역</footer>
        </body></html>
        """
        mock_session = MagicMock()
        mock_session.get.return_value = _make_response(html)
        mock_session_cls.return_value = mock_session

        result = await get_content("https://example.com")
        logger.info(f"nav/header/footer 제거 확인 → 결과: '{result[:100]}'")
        self.assertNotIn("메뉴 링크들", result)
        self.assertNotIn("헤더 영역", result)
        self.assertNotIn("푸터 영역", result)
        self.assertIn("본문 내용입니다.", result)

    @patch("services.webpage_service.requests.Session")
    async def test_long_text_truncated(self, mock_session_cls):
        long_text = "A" * 50000
        html = f"<html><body><p>{long_text}</p></body></html>"
        mock_session = MagicMock()
        mock_session.get.return_value = _make_response(html)
        mock_session_cls.return_value = mock_session

        result = await get_content("https://example.com")
        logger.info(f"긴 텍스트 자름 확인 → 결과 길이: {len(result)} (최대 40000)")
        self.assertLessEqual(len(result), 40000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
