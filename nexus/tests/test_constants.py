import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from constants import WORD_STAGE_DAYS, GRAMMAR_STAGE_DAYS, GRADUATED_STAGE, MAX_ACTIVE_STAGE


class TestConstants(unittest.TestCase):

    def test_word_stage_days_has_four_stages(self):
        self.assertEqual(set(WORD_STAGE_DAYS.keys()), {1, 2, 3, 4})

    def test_grammar_stage_days_has_three_stages(self):
        self.assertEqual(set(GRAMMAR_STAGE_DAYS.keys()), {1, 2, 3})

    def test_graduated_stage_is_above_max_active(self):
        self.assertGreater(GRADUATED_STAGE, MAX_ACTIVE_STAGE)

    def test_word_stage_days_ascending(self):
        days = [WORD_STAGE_DAYS[i] for i in sorted(WORD_STAGE_DAYS)]
        self.assertEqual(days, sorted(days))


if __name__ == "__main__":
    unittest.main()
