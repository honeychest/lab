import asyncio
import sys
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class TestSendNextQuizRecursionGuard(unittest.TestCase):
    """parse_word_page가 계속 None 반환해도 무한 재귀하지 않는다."""

    def test_all_pages_unparseable_sends_no_more_message(self):
        update = MagicMock()
        update.effective_message = MagicMock()
        update.effective_message.reply_text = AsyncMock()

        words = [{"id": f"p{i}"} for i in range(5)]

        with patch("handlers.quiz_handler.QuizSession") as MockQS, \
             patch("handlers.quiz_handler.notion_service") as mock_ns:
            qs = MagicMock()
            qs.get_session = AsyncMock(return_value={"mode": "auto"})
            qs.pop_prefetch = AsyncMock(return_value=None)
            qs.consume_count = AsyncMock(return_value=(3, 5))
            qs.set_count = AsyncMock()
            qs.clear_state = AsyncMock()
            qs.clear_active = AsyncMock()
            MockQS.return_value = qs

            mock_ns.get_words_due = AsyncMock(return_value=words)
            mock_ns.parse_word_page = MagicMock(return_value=None)

            from handlers import quiz_handler
            _run(quiz_handler._send_next_quiz(update, chat_id=1))

        # 재귀하지 않고 종료 — 무한 reply_text 호출 없음
        self.assertLessEqual(update.effective_message.reply_text.call_count, 2)


if __name__ == "__main__":
    unittest.main()
