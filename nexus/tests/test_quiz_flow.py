import asyncio
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


class FakeQuizSession:
    def __init__(self, progress=(4, 5)):
        self.progress = progress
        self.saved_session = None
        self.state = None
        self.resumed = False
        self.prefetch_cleared = False
        self.count_reset = False
        self.current_session = None

    async def consume_count(self):
        return self.progress

    async def get_session(self):
        return self.current_session

    async def set_session(self, data):
        self.saved_session = data

    async def set_state(self, state):
        self.state = state

    async def resume(self):
        self.resumed = True

    async def clear_prefetch(self):
        self.prefetch_cleared = True

    async def reset_count(self):
        self.count_reset = True


class FakeWordSource:
    async def get_due_words(self):
        return [{
            "page_id": "good",
            "word": "apple",
            "meaning_ko": "사과",
            "stage": 1,
        }]

    async def get_all_words(self):
        return [{
            "page_id": "good",
            "word": "apple",
            "meaning_ko": "사과",
            "stage": 1,
        }]


class FakeQuizGenerator:
    def __init__(self, grade_result=None):
        self.grade_result = grade_result or {
            "used_correctly": True,
            "context_ok": True,
            "grammar_errors": [],
            "collocation_errors": [],
            "alternatives": [],
        }

    async def generate_quiz(self, word, meaning_ko, stage):
        return "A round fruit."

    async def grade_writing(self, word, meaning_ko, question, answer):
        return self.grade_result


class FakeGrammarPending:
    def __init__(self):
        self.saved = None

    async def set(self, data):
        self.saved = data


class FakeStageUpdater:
    def __init__(self):
        self.calls = []

    async def update_word_stage(self, page_id, correct):
        self.calls.append((page_id, correct))


class EmptyWordSource:
    async def get_due_words(self):
        return []

    async def get_all_words(self):
        return []


class UnparseableWordSource:
    async def get_due_words(self):
        return []

    async def get_all_words(self):
        return []


class TestQuizFlowAutoStart(unittest.TestCase):
    def test_auto_quiz_starts_with_first_parseable_due_word(self):
        from services.quiz_flow import QuizFlow, QuizTurn

        session = FakeQuizSession()
        flow = QuizFlow(
            session=session,
            word_source=FakeWordSource(),
            quiz_generator=FakeQuizGenerator(),
        )

        result = _run(flow.start_auto_quiz())

        self.assertIsInstance(result, QuizTurn)
        self.assertEqual(result.progress, "[1/5]")
        self.assertEqual(result.word, "apple")
        self.assertEqual(result.body, "A round fruit.")
        self.assertEqual(session.state, "quiz")
        self.assertEqual(session.saved_session["page_id"], "good")
        self.assertEqual(session.saved_session["mode"], "auto")

    def test_auto_quiz_reports_no_quiz_when_no_due_words_exist(self):
        from services.quiz_flow import NoQuizAvailable, QuizFlow

        session = FakeQuizSession()
        flow = QuizFlow(
            session=session,
            word_source=EmptyWordSource(),
            quiz_generator=FakeQuizGenerator(),
        )

        result = _run(flow.start_auto_quiz())

        self.assertIsInstance(result, NoQuizAvailable)
        self.assertEqual(result.message, "오늘 복습할 단어가 없어요")
        self.assertIsNone(session.saved_session)

    def test_practice_quiz_starts_with_first_parseable_word(self):
        from services.quiz_flow import QuizFlow, QuizTurn

        session = FakeQuizSession()
        flow = QuizFlow(
            session=session,
            word_source=FakeWordSource(),
            quiz_generator=FakeQuizGenerator(),
        )

        result = _run(flow.start_practice_quiz())

        self.assertIsInstance(result, QuizTurn)
        self.assertTrue(session.resumed)
        self.assertTrue(session.prefetch_cleared)
        self.assertTrue(session.count_reset)
        self.assertEqual(result.progress, "[🔄]")
        self.assertEqual(result.word, "apple")
        self.assertEqual(session.state, "quiz")
        self.assertEqual(session.saved_session["mode"], "quiz")

    def test_next_auto_quiz_reports_no_quiz_when_due_words_are_unparseable(self):
        from services.quiz_flow import NoQuizAvailable, QuizFlow

        session = FakeQuizSession()
        flow = QuizFlow(
            session=session,
            word_source=UnparseableWordSource(),
            quiz_generator=FakeQuizGenerator(),
        )

        result = _run(flow.start_next_quiz(mode="auto"))

        self.assertIsInstance(result, NoQuizAvailable)
        self.assertEqual(result.message, "오늘 복습할 단어가 없어요!")
        self.assertIsNone(session.saved_session)

    def test_next_auto_quiz_excludes_previous_page(self):
        from services.quiz_flow import QuizFlow, QuizTurn

        session = FakeQuizSession()
        flow = QuizFlow(
            session=session,
            word_source=FakeWordSource(),
            quiz_generator=FakeQuizGenerator(),
        )

        result = _run(flow.start_next_quiz(mode="auto", exclude_page_id="other"))

        self.assertIsInstance(result, QuizTurn)
        self.assertEqual(result.page_id, "good")
        self.assertEqual(session.saved_session["page_id"], "good")

    def test_stage_one_correct_answer_updates_stage_and_continues(self):
        from services.quiz_flow import QuizAnswerFeedback, QuizFlow

        session = FakeQuizSession()
        session.current_session = {
            "word": "apple",
            "meaning_ko": "사과",
            "stage": 1,
            "page_id": "word-page",
            "question": "A round fruit.",
            "mode": "auto",
        }
        updater = FakeStageUpdater()
        flow = QuizFlow(
            session=session,
            word_source=FakeWordSource(),
            quiz_generator=FakeQuizGenerator(),
            stage_updater=updater,
        )

        result = _run(flow.grade_answer(" apple "))

        self.assertIsInstance(result, QuizAnswerFeedback)
        self.assertEqual(result.reply, "✅ 정답!")
        self.assertTrue(result.should_continue)
        self.assertEqual(result.next_exclude_page_id, "word-page")
        self.assertEqual(updater.calls, [("word-page", True)])

    def test_stage_one_typo_answer_retries_once_without_stage_update(self):
        from services.quiz_flow import QuizAnswerFeedback, QuizFlow

        session = FakeQuizSession()
        session.current_session = {
            "word": "apple",
            "meaning_ko": "사과",
            "stage": 1,
            "page_id": "word-page",
            "question": "A round fruit.",
            "mode": "auto",
        }
        updater = FakeStageUpdater()
        flow = QuizFlow(
            session=session,
            word_source=FakeWordSource(),
            quiz_generator=FakeQuizGenerator(),
            stage_updater=updater,
        )

        result = _run(flow.grade_answer("appl"))

        self.assertIsInstance(result, QuizAnswerFeedback)
        self.assertEqual(result.reply, "오타인 것 같아요! 다시 한번! 🔄")
        self.assertFalse(result.should_continue)
        self.assertEqual(session.saved_session["retry_count"], 1)
        self.assertEqual(updater.calls, [])

    def test_fail_current_quiz_resets_word_stage_and_continues(self):
        from services.quiz_flow import QuizAnswerFeedback, QuizFlow

        session = FakeQuizSession()
        session.current_session = {
            "word": "apple",
            "meaning_ko": "사과",
            "stage": 1,
            "page_id": "word-page",
            "question": "A round fruit.",
            "mode": "auto",
        }
        updater = FakeStageUpdater()
        flow = QuizFlow(
            session=session,
            word_source=FakeWordSource(),
            quiz_generator=FakeQuizGenerator(),
            stage_updater=updater,
        )

        result = _run(flow.fail_current_quiz())

        self.assertIsInstance(result, QuizAnswerFeedback)
        self.assertEqual(result.reply, "❌ 실패. 정답은 'apple'예요. 1단계로 돌아갑니다.")
        self.assertEqual(result.next_exclude_page_id, "word-page")
        self.assertEqual(updater.calls, [("word-page", False)])

    def test_writing_answer_with_meaning_but_missing_word_retries_without_stage_update(self):
        from services.quiz_flow import QuizAnswerFeedback, QuizFlow

        session = FakeQuizSession()
        session.current_session = {
            "word": "apple",
            "meaning_ko": "사과",
            "stage": 3,
            "page_id": "word-page",
            "question": "사과를 먹었다.",
            "mode": "auto",
        }
        updater = FakeStageUpdater()
        flow = QuizFlow(
            session=session,
            word_source=FakeWordSource(),
            quiz_generator=FakeQuizGenerator(grade_result={
                "used_correctly": False,
                "context_ok": True,
                "grammar_errors": [],
                "collocation_errors": [],
                "alternatives": [],
            }),
            stage_updater=updater,
        )

        result = _run(flow.grade_answer("I ate the fruit."))

        self.assertIsInstance(result, QuizAnswerFeedback)
        self.assertEqual(result.reply, "⚠️ 의미는 맞지만 'apple'를 직접 사용해야 해요. 다시 도전!")
        self.assertFalse(result.should_continue)
        self.assertEqual(updater.calls, [])

    def test_writing_answer_with_grammar_errors_saves_pending_feedback(self):
        from services.quiz_flow import QuizAnswerFeedback, QuizFlow

        session = FakeQuizSession()
        session.current_session = {
            "word": "apple",
            "meaning_ko": "사과",
            "stage": 3,
            "page_id": "word-page",
            "question": "사과를 먹었다.",
            "mode": "auto",
        }
        updater = FakeStageUpdater()
        grammar_pending = FakeGrammarPending()
        flow = QuizFlow(
            session=session,
            word_source=FakeWordSource(),
            quiz_generator=FakeQuizGenerator(grade_result={
                "used_correctly": True,
                "context_ok": True,
                "grammar_errors": [{"type": "시제", "detail": "eat → ate"}],
                "collocation_errors": ["eat an apple"],
                "alternatives": ["I had an apple."],
            }),
            stage_updater=updater,
            grammar_pending=grammar_pending,
        )

        result = _run(flow.grade_answer("I apple eat."))

        self.assertIsInstance(result, QuizAnswerFeedback)
        self.assertFalse(result.should_continue)
        self.assertTrue(result.needs_correction)
        self.assertIn("✅ 정답! 올바르게 사용했어요.", result.reply)
        self.assertEqual(result.grammar_errors, [{"type": "시제", "detail": "eat → ate"}])
        self.assertEqual(result.collocation_errors, ["eat an apple"])
        self.assertEqual(grammar_pending.saved["expression"], "apple")
        self.assertEqual(updater.calls, [("word-page", True)])


if __name__ == "__main__":
    unittest.main()
