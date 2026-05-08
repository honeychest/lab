from dataclasses import dataclass
from uuid import uuid4

from handlers.callback_codec import inbox_done, inbox_postpone, inbox_postpone_date


@dataclass(frozen=True)
class InboxItemActions:
    short_key: str
    done_callback: str
    postpone_callback: str


class InboxActionToken:
    def __init__(self, store, token_factory=None, ttl: int = 86400):
        self._store = store
        self._token_factory = token_factory or (lambda: uuid4().hex[:8])
        self._ttl = ttl

    async def create_item_actions(self, page_id: str) -> InboxItemActions:
        short_key = self._token_factory()
        await self._store.set(short_key, page_id, ttl=self._ttl)
        return InboxItemActions(
            short_key=short_key,
            done_callback=inbox_done(short_key),
            postpone_callback=inbox_postpone(short_key),
        )

    async def resolve(self, short_key: str) -> str | None:
        return await self._store.get(short_key)

    def postpone_callback(self, short_key: str) -> str:
        return inbox_postpone(short_key)

    def postpone_date_callback(self, short_key: str, date_iso: str) -> str:
        return inbox_postpone_date(short_key, date_iso)


class RedisInboxActionTokenStore:
    async def get(self, short_key: str) -> str | None:
        from session import InboxCallback

        return await InboxCallback(short_key).get()

    async def set(self, short_key: str, page_id: str, ttl: int = 86400) -> None:
        from session import InboxCallback

        await InboxCallback(short_key).set(page_id, ttl=ttl)


def create_inbox_action_token() -> InboxActionToken:
    return InboxActionToken(RedisInboxActionTokenStore())
