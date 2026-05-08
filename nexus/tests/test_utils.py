import sys
import os
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.strings import levenshtein


class TestLevenshtein(unittest.TestCase):

    def test_identical(self):
        self.assertEqual(levenshtein("apple", "apple"), 0)

    def test_one_insertion(self):
        self.assertEqual(levenshtein("apple", "aple"), 1)

    def test_one_substitution(self):
        self.assertEqual(levenshtein("apple", "aplle"), 1)

    def test_case_insensitive(self):
        self.assertEqual(levenshtein("Apple", "apple"), 0)

    def test_empty_vs_word(self):
        self.assertEqual(levenshtein("", "abc"), 3)

    def test_both_empty(self):
        self.assertEqual(levenshtein("", ""), 0)


if __name__ == "__main__":
    unittest.main()
