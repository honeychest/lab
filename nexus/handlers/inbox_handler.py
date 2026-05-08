import logging
from datetime import date, timedelta

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from chs import dlog
from session import InboxPending, InboxCallback
from services import notion_service
from handlers.callback_codec import (
    INBOX_SHORT_CONFIRM, INBOX_SHORT_CANCEL,
    inbox_date, inbox_kind, inbox_postpone, inbox_postpone_date, inbox_done,
    decode_inbox_date, decode_inbox_postpone, decode_inbox_postpone_date, decode_inbox_done,
)

logger = logging.getLogger(__name__)


def _build_date_buttons(base_date: date, mode: str, short_key: str = "") -> list:
    weekdays = ["월", "화", "수", "목", "금", "토", "일"]
    buttons = []

    if mode == "register":
        buttons.append([
            InlineKeyboardButton("오늘", callback_data=inbox_date(base_date.isoformat())),
            InlineKeyboardButton("내일", callback_data=inbox_date((base_date + timedelta(days=1)).isoformat())),
            InlineKeyboardButton("모레", callback_data=inbox_date((base_date + timedelta(days=2)).isoformat())),
        ])
    else:
        buttons.append([
            InlineKeyboardButton("내일", callback_data=inbox_postpone_date(short_key, (base_date + timedelta(days=1)).isoformat())),
            InlineKeyboardButton("모레", callback_data=inbox_postpone_date(short_key, (base_date + timedelta(days=2)).isoformat())),
        ])

    row = []
    for i in range(3, 7):
        target_date = base_date + timedelta(days=i)
        weekday = weekdays[target_date.weekday()]
        label = f"{weekday}({target_date.day})"
        if mode == "register":
            row.append(InlineKeyboardButton(label, callback_data=inbox_date(target_date.isoformat())))
        else:
            row.append(InlineKeyboardButton(label, callback_data=inbox_postpone_date(short_key, target_date.isoformat())))

    buttons.append(row)
    return buttons


def _replace_row_by_callback_prefix(markup: InlineKeyboardMarkup, prefix: str, new_rows: list) -> InlineKeyboardMarkup:
    if not markup or not markup.inline_keyboard:
        return InlineKeyboardMarkup(new_rows)
    new_keyboard = []
    replaced = False
    for row in markup.inline_keyboard:
        if not replaced and row and row[0].callback_data and row[0].callback_data.startswith(prefix):
            new_keyboard.extend(new_rows)
            replaced = True
        else:
            new_keyboard.append(row)
    return InlineKeyboardMarkup(new_keyboard)


def _format_date_label(date_iso: str, today: date) -> str:
    target = date.fromisoformat(date_iso)
    if target == today:
        return "오늘"
    elif target == today + timedelta(days=1):
        return "내일"
    elif target == today + timedelta(days=2):
        return "모레"
    else:
        weekdays = ["월", "화", "수", "목", "금", "토", "일"]
        weekday = weekdays[target.weekday()]
        return f"{target.month}월 {target.day}일({weekday})"


async def handle_inbox_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    chat_id = query.message.chat_id
    data = query.data
    today = date.today()
    ip = InboxPending(chat_id)

    try:
        if data == INBOX_SHORT_CONFIRM:
            pending = await ip.get()
            if not pending:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return
            text = pending.get("short_confirm")
            if not text:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return
            await ip.set({"text": text})
            buttons = [[
                InlineKeyboardButton("할일", callback_data="inbox:kind:할일"),
                InlineKeyboardButton("아이디어", callback_data="inbox:kind:아이디어"),
                InlineKeyboardButton("취소", callback_data="inbox:kind:취소"),
            ]]
            await query.edit_message_reply_markup(reply_markup=InlineKeyboardMarkup(buttons))

        elif data == INBOX_SHORT_CANCEL:
            await ip.clear()
            await query.edit_message_text("취소되었습니다")

        elif data == inbox_kind("취소"):
            await ip.clear()
            await query.edit_message_text("취소되었습니다")

        elif data == inbox_kind("아이디어"):
            pending = await ip.get()
            if not pending:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return
            text = pending.get("text")
            if not text:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return
            try:
                await notion_service.add_inbox(text, "아이디어", None)
                await query.edit_message_text(f"✔ 아이디어 저장: {text}")
                await ip.clear()
            except Exception as e:
                logger.warning(f"Notion 저장 실패: {e}")
                await query.answer("❌ 저장에 실패했습니다. 다시 시도해주세요", show_alert=True)

        elif data == inbox_kind("할일"):
            pending = await ip.get()
            if not pending:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return
            buttons = _build_date_buttons(today, "register")
            await query.edit_message_reply_markup(reply_markup=InlineKeyboardMarkup(buttons))

        elif data.startswith("inbox:date:"):
            date_iso = decode_inbox_date(data)
            pending = await ip.get()
            if not pending:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return
            text = pending.get("text")
            try:
                await notion_service.add_inbox(text, "할일", date_iso)
                label = _format_date_label(date_iso, today)
                await query.edit_message_text(f"✔ 할일 저장 — {label}까지: {text}")
                await ip.clear()
            except Exception as e:
                logger.warning(f"Notion 저장 실패: {e}")
                await query.answer("❌ 저장에 실패했습니다. 다시 시도해주세요", show_alert=True)

        elif data.startswith("inbox:postpone:"):
            short_key = decode_inbox_postpone(data)
            page_id = await InboxCallback(short_key).get()
            if not page_id:
                await query.answer("만료된 요청입니다")
                return
            buttons = _build_date_buttons(today, "postpone", short_key)
            await query.edit_message_reply_markup(reply_markup=_replace_row_by_callback_prefix(
                query.message.reply_markup, inbox_postpone(short_key), buttons
            ))

        elif data.startswith("inbox:postpone_date:"):
            short_key, date_iso = decode_inbox_postpone_date(data)
            page_id = await InboxCallback(short_key).get()
            if not page_id:
                await query.answer("만료된 요청입니다")
                return
            try:
                await notion_service.update_inbox_date(page_id, date_iso)
                label = _format_date_label(date_iso, today)
                await query.answer(f"↩ {label}로 연기되었습니다")
            except Exception as e:
                logger.warning(f"Notion 업데이트 실패: {e}")
                await query.answer("❌ 저장에 실패했습니다. 다시 시도해주세요", show_alert=True)

        elif data.startswith("inbox:done:"):
            short_key = decode_inbox_done(data)
            page_id = await InboxCallback(short_key).get()
            if not page_id:
                await query.answer("만료된 요청입니다")
                return
            try:
                await notion_service.update_inbox_status(page_id, "완료")
                await query.edit_message_text("✔ " + query.message.text)
            except Exception as e:
                logger.warning(f"Notion 업데이트 실패: {e}")
                await query.answer("❌ 저장에 실패했습니다. 다시 시도해주세요", show_alert=True)

    except Exception as e:
        logger.error(f"inbox_callback 오류: {e}")
        await query.answer("오류가 발생했습니다", show_alert=True)
