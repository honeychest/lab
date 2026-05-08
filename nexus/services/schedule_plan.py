from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class ScheduleInputs:
    hour: int
    today: date
    pending: list[dict]
    done: list[dict]
    tomorrow: list[dict]
    quiz_count: int


@dataclass(frozen=True)
class ScheduleMessage:
    text: str
    action: dict | None = None


def build_schedule_plan(inputs: ScheduleInputs) -> list[ScheduleMessage]:
    if inputs.hour == 22:
        return _build_closing_plan(inputs)
    return _build_daytime_plan(inputs)


def _build_closing_plan(inputs: ScheduleInputs) -> list[ScheduleMessage]:
    if not inputs.pending and not inputs.done and not inputs.tomorrow and inputs.quiz_count == 0:
        return []

    messages: list[ScheduleMessage] = []
    header_parts = ["📋 오늘 마무리"]
    for item in inputs.done:
        header_parts.append(f"~~{item['text']}~~ ✔")
    if not inputs.pending and not inputs.done:
        header_parts.append("오늘 마무리할 일 없음")
    if inputs.tomorrow:
        header_parts.append("")
        header_parts.append("📅 내일 예정")
        for item in inputs.tomorrow:
            header_parts.append(f"• {item['text']}")
    messages.append(ScheduleMessage("\n".join(header_parts)))

    for item in inputs.pending:
        messages.append(ScheduleMessage(
            text=f"📋 {item['text']}",
            action={
                "kind": "inbox_item",
                "done_callback": item.get("done_callback", f"inbox:done:{item['short_key']}"),
                "postpone_callback": item.get("postpone_callback", f"inbox:postpone:{item['short_key']}"),
            },
        ))

    if inputs.quiz_count > 0:
        messages.append(ScheduleMessage(
            text=f"🔤 퀴즈 {inputs.quiz_count}개 남음",
            action={"kind": "quiz_start"},
        ))
    else:
        messages.append(ScheduleMessage("🔤 퀴즈 ✔ 완료"))

    return messages


def _build_daytime_plan(inputs: ScheduleInputs) -> list[ScheduleMessage]:
    has_todos = bool(inputs.pending or inputs.done or inputs.tomorrow)
    if not has_todos and inputs.quiz_count == 0 and inputs.hour != 15:
        return []

    messages: list[ScheduleMessage] = []
    for item in inputs.pending:
        messages.append(ScheduleMessage(
            text=f"📋 {item['text']}",
            action={
                "kind": "inbox_item",
                "done_callback": item.get("done_callback", f"inbox:done:{item['short_key']}"),
                "postpone_callback": item.get("postpone_callback", f"inbox:postpone:{item['short_key']}"),
            },
        ))

    for item in inputs.done:
        messages.append(ScheduleMessage(f"✔ ~~{item['text']}~~"))

    if not inputs.pending and not inputs.done and inputs.tomorrow:
        text_parts = ["📅 내일 예정"]
        for item in inputs.tomorrow:
            text_parts.append(f"• {item['text']}")
        messages.append(ScheduleMessage("\n".join(text_parts)))

    if inputs.quiz_count > 0:
        messages.append(ScheduleMessage(
            text=f"🔤 퀴즈 {inputs.quiz_count}개 남음",
            action={"kind": "quiz_start"},
        ))
    elif inputs.hour == 15:
        messages.append(ScheduleMessage("오늘 복습할 단어가 없어요"))

    return messages
