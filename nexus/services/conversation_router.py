from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ConversationIntent:
    kind: str
    text: str
    payload: dict | None = None


class ConversationRouter:
    def __init__(self, state: Any):
        self._state = state

    async def route(self, text: str) -> ConversationIntent:
        text = text.strip()

        if await self._state.is_law_active():
            return ConversationIntent("law_query", text)

        if "http" in text:
            return ConversationIntent("url", text)

        if text.startswith("/"):
            return ConversationIntent("ignored_command", text)

        if await self._state.get_quiz_state() == "quiz" and not await self._state.is_quiz_paused():
            return ConversationIntent("quiz_answer", text)

        if not _contains_hangul(text):
            return ConversationIntent("word_query", text)

        if len(text) <= 3:
            return ConversationIntent("inbox_short_confirm", text, {"short_confirm": text})

        return ConversationIntent("inbox_kind_select", text, {"text": text})


class RedisConversationState:
    def __init__(self, chat_id: int):
        from session import LawState, QuizSession

        self._law = LawState(chat_id)
        self._quiz = QuizSession(chat_id)

    async def is_law_active(self) -> bool:
        return await self._law.is_active()

    async def get_quiz_state(self) -> str | None:
        return await self._quiz.get_state()

    async def is_quiz_paused(self) -> bool:
        return await self._quiz.is_paused()


def _contains_hangul(text: str) -> bool:
    return any("가" <= c <= "힯" for c in text)
