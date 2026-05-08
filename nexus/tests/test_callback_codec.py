import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from handlers.callback_codec import (
    inbox_date,
    inbox_kind,
    inbox_postpone,
    inbox_postpone_date,
    inbox_done,
    decode_inbox_date,
    decode_inbox_kind,
    decode_inbox_postpone,
    decode_inbox_postpone_date,
    decode_inbox_done,
    INBOX_SHORT_CONFIRM,
    INBOX_SHORT_CANCEL,
)


class TestRoundtrip(unittest.TestCase):
    """encode → decode 라운드트립."""

    def test_inbox_date(self):
        self.assertEqual(decode_inbox_date(inbox_date("2026-05-09")), "2026-05-09")

    def test_inbox_kind(self):
        self.assertEqual(decode_inbox_kind(inbox_kind("할일")), "할일")

    def test_inbox_postpone(self):
        self.assertEqual(decode_inbox_postpone(inbox_postpone("abc123")), "abc123")

    def test_inbox_postpone_date(self):
        short_key, date_iso = decode_inbox_postpone_date(
            inbox_postpone_date("abc123", "2026-05-10")
        )
        self.assertEqual(short_key, "abc123")
        self.assertEqual(date_iso, "2026-05-10")

    def test_inbox_done(self):
        self.assertEqual(decode_inbox_done(inbox_done("xyz789")), "xyz789")


class TestDecodeRaisesOnMalformed(unittest.TestCase):
    """잘못된 포맷은 ValueError."""

    def test_inbox_date_wrong_prefix(self):
        with self.assertRaises(ValueError):
            decode_inbox_date("inbox:done:2026-05-09")

    def test_inbox_postpone_date_missing_date(self):
        with self.assertRaises(ValueError):
            decode_inbox_postpone_date("inbox:postpone_date:abc123")

    def test_inbox_postpone_date_empty(self):
        with self.assertRaises(ValueError):
            decode_inbox_postpone_date("")

    def test_inbox_done_wrong_prefix(self):
        with self.assertRaises(ValueError):
            decode_inbox_done("inbox:date:abc123")


class TestConstants(unittest.TestCase):
    """상수 값 검증."""

    def test_short_confirm(self):
        self.assertEqual(INBOX_SHORT_CONFIRM, "inbox:short_confirm")

    def test_short_cancel(self):
        self.assertEqual(INBOX_SHORT_CANCEL, "inbox:short_cancel")

    def test_inbox_kind_idea(self):
        self.assertEqual(inbox_kind("아이디어"), "inbox:kind:아이디어")

    def test_inbox_postpone_prefix(self):
        self.assertTrue(inbox_postpone("k1").startswith("inbox:postpone:"))

    def test_inbox_postpone_date_prefix(self):
        self.assertTrue(inbox_postpone_date("k1", "2026-05-09").startswith("inbox:postpone_date:"))


if __name__ == "__main__":
    unittest.main()
