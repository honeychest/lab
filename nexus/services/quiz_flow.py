from dataclasses import dataclass
from typing import Any

from utils.strings import levenshtein


@dataclass(frozen=True)
class QuizTurn:
    word: str
    page_id: str
    stage: int
    progress: str
    body: str


@dataclass(frozen=True)
class NoQuizAvailable:
    message: str


@dataclass(frozen=True)
class QuizComplete:
    message: str


@dataclass(frozen=True)
class QuizAnswerFeedback:
    reply: str
    should_continue: bool
    next_exclude_page_id: str | None = None
    grammar_errors: list[dict] | None = None
    collocation_errors: list[str] | None = None


class QuizFlow:
    def __init__(
        self,
        session: Any,
        word_source: Any,
        quiz_generator: Any,
        stage_updater: Any | None = None,
        grammar_pending: Any | None = None,
    ):
        self._session = session
        self._word_source = word_source
        self._quiz_generator = quiz_generator
        self._stage_updater = stage_updater
        self._grammar_pending = grammar_pending

    async def start_auto_quiz(self) -> QuizTurn | NoQuizAvailable | QuizComplete:
        words = await self._word_source.get_due_words()
        if not words:
            if hasattr(self._session, "set_count"):
                await self._session.set_count(0)
            if hasattr(self._session, "clear_state"):
                await self._session.clear_state()
            return NoQuizAvailable("오늘 복습할 단어가 없어요")

        parsed = words[0]

        progress_info = await self._session.consume_count()
        if progress_info is None:
            if hasattr(self._session, "clear_active"):
                await self._session.clear_active()
            return QuizComplete("🎉 오늘 퀴즈 완료! 수고했어요 💪")
        remaining, total = progress_info

        question = await self._quiz_generator.generate_quiz(
            parsed["word"],
            parsed["meaning_ko"],
            parsed["stage"],
        )

        await self._session.set_session({
            "word": parsed["word"],
            "meaning_ko": parsed["meaning_ko"],
            "stage": parsed["stage"],
            "page_id": parsed["page_id"],
            "question": question,
            "mode": "auto",
        })
        await self._session.set_state("quiz")

        progress = _format_progress(remaining, total)
        body = f"{parsed['meaning_ko']}\n\n{question}" if parsed["stage"] == 1 else question
        return QuizTurn(
            word=parsed["word"],
            page_id=parsed["page_id"],
            stage=parsed["stage"],
            progress=progress,
            body=body,
        )

    async def start_practice_quiz(self) -> QuizTurn | NoQuizAvailable:
        await self._session.resume()
        await self._session.clear_prefetch()
        await self._session.reset_count()

        words = await self._word_source.get_all_words()
        if not words:
            return NoQuizAvailable("단어장이 비어있어요! 단어를 추가해봐요 😊")

        parsed = words[:100][0]

        question = await self._quiz_generator.generate_quiz(
            parsed["word"],
            parsed["meaning_ko"],
            parsed["stage"],
        )

        await self._session.set_session({
            "word": parsed["word"],
            "meaning_ko": parsed["meaning_ko"],
            "stage": parsed["stage"],
            "page_id": parsed["page_id"],
            "question": question,
            "mode": "quiz",
        })
        await self._session.set_state("quiz")

        body = f"{parsed['meaning_ko']}\n\n{question}" if parsed["stage"] == 1 else question
        return QuizTurn(
            word=parsed["word"],
            page_id=parsed["page_id"],
            stage=parsed["stage"],
            progress="[🔄]",
            body=body,
        )

    async def start_next_quiz(
        self,
        *,
        mode: str,
        exclude_page_id: str | None = None,
    ) -> QuizTurn | NoQuizAvailable | QuizComplete:
        if mode == "quiz":
            words = await self._word_source.get_all_words()
            empty_message = "단어장이 비어있어요!"
        else:
            words = await self._word_source.get_due_words()
            empty_message = "오늘 복습할 단어가 없어요!"

        if exclude_page_id:
            words = [w for w in words if w["page_id"] != exclude_page_id]

        if not words:
            if mode == "auto":
                if hasattr(self._session, "set_count"):
                    await self._session.set_count(0)
                if hasattr(self._session, "clear_state"):
                    await self._session.clear_state()
            return NoQuizAvailable(empty_message)

        parsed = (words[:100] if mode == "quiz" else words)[0]

        remaining = total = None
        if mode == "auto":
            progress_info = await self._session.consume_count()
            if progress_info is None:
                if hasattr(self._session, "clear_active"):
                    await self._session.clear_active()
                return QuizComplete("🎉 오늘 퀴즈 완료! 수고했어요 💪")
            remaining, total = progress_info

        question = await self._quiz_generator.generate_quiz(
            parsed["word"],
            parsed["meaning_ko"],
            parsed["stage"],
        )

        await self._session.set_session({
            "word": parsed["word"],
            "meaning_ko": parsed["meaning_ko"],
            "stage": parsed["stage"],
            "page_id": parsed["page_id"],
            "question": question,
            "mode": mode,
        })
        await self._session.set_state("quiz")

        progress = _format_progress(remaining, total) if mode == "auto" else "[🔄]"
        body = f"{parsed['meaning_ko']}\n\n{question}" if parsed["stage"] == 1 else question
        return QuizTurn(
            word=parsed["word"],
            page_id=parsed["page_id"],
            stage=parsed["stage"],
            progress=progress,
            body=body,
        )

    async def grade_answer(self, text: str) -> QuizAnswerFeedback | NoQuizAvailable:
        session = await self._session.get_session()
        if not session:
            return NoQuizAvailable("진행 중인 퀴즈가 없어요.")

        word = session["word"]
        meaning_ko = session["meaning_ko"]
        stage = session["stage"]
        page_id = session["page_id"]
        question = session.get("question", "")
        mode = session.get("mode", "auto")

        if stage >= 3:
            return await self._grade_writing_answer(
                session=session,
                word=word,
                meaning_ko=meaning_ko,
                question=question,
                answer=text,
                page_id=page_id,
                mode=mode,
            )

        correct = text.strip().lower() == word.lower()
        if correct:
            reply = "✅ 정답!"
        else:
            distance = levenshtein(text, word)
            retry_count = session.get("retry_count", 0)
            if distance <= 2 and retry_count == 0:
                session["retry_count"] = 1
                await self._session.set_session(session)
                return QuizAnswerFeedback(
                    reply="오타인 것 같아요! 다시 한번! 🔄",
                    should_continue=False,
                )
            reply = f"❌ 오답. 정답은 '{word}'예요. 1단계로 돌아갑니다."

        if self._stage_updater and not (mode == "quiz" and correct):
            await self._stage_updater.update_word_stage(page_id, correct)

        return QuizAnswerFeedback(
            reply=reply,
            should_continue=True,
            next_exclude_page_id=page_id,
        )

    async def _grade_writing_answer(
        self,
        *,
        session: dict,
        word: str,
        meaning_ko: str,
        question: str,
        answer: str,
        page_id: str,
        mode: str,
    ) -> QuizAnswerFeedback:
        word_used = word.lower() in answer.lower()
        result = await self._quiz_generator.grade_writing(word, meaning_ko, question, answer)

        if not word_used:
            if result["context_ok"]:
                return QuizAnswerFeedback(
                    reply=f"⚠️ 의미는 맞지만 '{word}'를 직접 사용해야 해요. 다시 도전!",
                    should_continue=False,
                )
            correct = False
            reply = f"❌ 오답. '{word}'를 사용한 문장을 만들어보세요. 1단계로 돌아갑니다."
        else:
            correct = result["used_correctly"]
            if correct:
                reply = "✅ 정답! 올바르게 사용했어요."
                alternatives = result.get("alternatives", [])
                if alternatives:
                    reply += "\n\n💡 비슷한 표현: " + " / ".join(alternatives)
            else:
                reply = f"❌ 오답. '{word}'를 올바른 맥락으로 사용해야 해요. 1단계로 돌아갑니다."

        grammar_errors = result.get("grammar_errors", [])
        collocation_errors = result.get("collocation_errors", [])

        if correct and (grammar_errors or collocation_errors):
            if grammar_errors:
                error_lines = "\n".join(f"[{e['type']}] {e['detail']}" for e in grammar_errors)
                reply += f"\n\n⚠️ 문법 오류:\n{error_lines}"
            if collocation_errors:
                reply += f"\n\n💡 연어 등록 추천:\n" + "\n".join(collocation_errors)

            if self._grammar_pending:
                await self._grammar_pending.set({
                    "expression": word,
                    "wrong_sentence": answer,
                    "grammar_errors": grammar_errors,
                    "collocation_errors": collocation_errors,
                })

        if self._stage_updater and not (mode == "quiz" and correct):
            await self._stage_updater.update_word_stage(page_id, correct)

        return QuizAnswerFeedback(
            reply=reply,
            should_continue=True,
            next_exclude_page_id=page_id,
            grammar_errors=grammar_errors if correct and grammar_errors else None,
            collocation_errors=collocation_errors if correct and collocation_errors else None,
        )

    async def fail_current_quiz(self) -> QuizAnswerFeedback | NoQuizAvailable:
        session = await self._session.get_session()
        if not session:
            return NoQuizAvailable("진행 중인 퀴즈가 없어요.")

        page_id = session["page_id"]
        if self._stage_updater:
            await self._stage_updater.update_word_stage(page_id, False)

        return QuizAnswerFeedback(
            reply=f"❌ 실패. 정답은 '{session['word']}'예요. 1단계로 돌아갑니다.",
            should_continue=True,
            next_exclude_page_id=page_id,
        )

def create_quiz_flow(chat_id: int) -> QuizFlow:
    from session import GrammarPending, QuizSession
    from services import ai_service, notion_service
    from services.word_repository import WordRepository

    return QuizFlow(
        session=QuizSession(chat_id),
        word_source=WordRepository(notion_service),
        quiz_generator=ai_service,
        stage_updater=notion_service,
        grammar_pending=GrammarPending(chat_id),
    )


def _format_progress(remaining: int, total: int | None = None) -> str:
    if total and total > 0:
        completed = max(0, min(total - remaining, total))
        return f"[{completed}/{total}]"
    return f"[남은 퀴즈 {remaining}개]"
