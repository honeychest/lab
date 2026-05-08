INBOX_SHORT_CONFIRM = "inbox:short_confirm"
INBOX_SHORT_CANCEL  = "inbox:short_cancel"


def inbox_date(date_iso: str) -> str:
    return f"inbox:date:{date_iso}"


def inbox_kind(kind: str) -> str:
    return f"inbox:kind:{kind}"


def inbox_postpone(short_key: str) -> str:
    return f"inbox:postpone:{short_key}"


def inbox_postpone_date(short_key: str, date_iso: str) -> str:
    return f"inbox:postpone_date:{short_key}:{date_iso}"


def inbox_done(short_key: str) -> str:
    return f"inbox:done:{short_key}"


def decode_inbox_date(data: str) -> str:
    parts = data.split(":", 2)
    if len(parts) != 3 or parts[:2] != ["inbox", "date"]:
        raise ValueError(f"잘못된 inbox:date 콜백: {data!r}")
    return parts[2]


def decode_inbox_kind(data: str) -> str:
    parts = data.split(":", 2)
    if len(parts) != 3 or parts[:2] != ["inbox", "kind"]:
        raise ValueError(f"잘못된 inbox:kind 콜백: {data!r}")
    return parts[2]


def decode_inbox_postpone(data: str) -> str:
    parts = data.split(":", 2)
    if len(parts) != 3 or parts[:2] != ["inbox", "postpone"]:
        raise ValueError(f"잘못된 inbox:postpone 콜백: {data!r}")
    return parts[2]


def decode_inbox_postpone_date(data: str) -> tuple[str, str]:
    parts = data.split(":")
    if len(parts) != 4 or parts[:2] != ["inbox", "postpone_date"]:
        raise ValueError(f"잘못된 inbox:postpone_date 콜백: {data!r}")
    return parts[2], parts[3]


def decode_inbox_done(data: str) -> str:
    parts = data.split(":", 2)
    if len(parts) != 3 or parts[:2] != ["inbox", "done"]:
        raise ValueError(f"잘못된 inbox:done 콜백: {data!r}")
    return parts[2]
