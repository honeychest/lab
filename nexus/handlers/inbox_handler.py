import json
import logging
from datetime import date, timedelta
from uuid import uuid4

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from redis_client import redis, _k, KEY_INBOX_PENDING, KEY_INBOX_CB
from services import notion_service

logger = logging.getLogger(__name__)


def _build_date_buttons(base_date: date, mode: str, short_key: str = "") -> list:
    """날짜 버튼 행 생성 — mode에 따라 [오늘] 포함 여부 결정.

    mode='register': 1행 [오늘][내일][모레], 2행 [요일(DD)]×4
    mode='postpone': 1행 [내일][모레], 2행 [요일(DD)]×4
    """
    weekdays = ["월", "화", "수", "목", "금", "토", "일"]
    buttons = []

    if mode == "register":
        buttons.append([
            InlineKeyboardButton("오늘", callback_data="inbox:date:" + base_date.isoformat()),
            InlineKeyboardButton("내일", callback_data="inbox:date:" + (base_date + timedelta(days=1)).isoformat()),
            InlineKeyboardButton("모레", callback_data="inbox:date:" + (base_date + timedelta(days=2)).isoformat()),
        ])
    else:  # postpone
        buttons.append([
            InlineKeyboardButton("내일", callback_data=f"inbox:postpone_date:{short_key}:" + (base_date + timedelta(days=1)).isoformat()),
            InlineKeyboardButton("모레", callback_data=f"inbox:postpone_date:{short_key}:" + (base_date + timedelta(days=2)).isoformat()),
        ])

    # 4일 뒤부터 7일까지
    row = []
    for i in range(3, 7):
        target_date = base_date + timedelta(days=i)
        weekday = weekdays[target_date.weekday()]
        label = f"{weekday}({target_date.day})"

        if mode == "register":
            row.append(InlineKeyboardButton(label, callback_data="inbox:date:" + target_date.isoformat()))
        else:
            row.append(InlineKeyboardButton(label, callback_data=f"inbox:postpone_date:{short_key}:" + target_date.isoformat()))

    buttons.append(row)
    return buttons


def _replace_row_by_callback_prefix(
    markup: InlineKeyboardMarkup, prefix: str, new_rows: list
) -> InlineKeyboardMarkup:
    """기존 키보드에서 첫 버튼 callback_data가 prefix로 시작하는 행 탐색, 교체."""
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
    """날짜 ISO를 사용자 표시용 레이블로 변환."""
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

    try:
        if data == "inbox:short_confirm":
            raw = await redis.get(_k(KEY_INBOX_PENDING, chat_id))
            if not raw:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return

            pending = json.loads(raw)
            text = pending.get("short_confirm")
            if not text:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return

            await redis.set(_k(KEY_INBOX_PENDING, chat_id), json.dumps({"text": text}), ex=600)
            buttons = [[
                InlineKeyboardButton("할일", callback_data="inbox:kind:할일"),
                InlineKeyboardButton("아이디어", callback_data="inbox:kind:아이디어"),
                InlineKeyboardButton("취소", callback_data="inbox:kind:취소"),
            ]]
            await query.edit_message_reply_markup(reply_markup=InlineKeyboardMarkup(buttons))

        elif data == "inbox:short_cancel":
            await redis.delete(_k(KEY_INBOX_PENDING, chat_id))
            await query.edit_message_text("취소되었습니다")

        elif data == "inbox:kind:취소":
            await redis.delete(_k(KEY_INBOX_PENDING, chat_id))
            await query.edit_message_text("취소되었습니다")

        elif data == "inbox:kind:아이디어":
            raw = await redis.get(_k(KEY_INBOX_PENDING, chat_id))
            if not raw:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return

            pending = json.loads(raw)
            text = pending.get("text")
            if not text:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return

            try:
                await notion_service.add_inbox(text, "아이디어", None)
                await query.edit_message_text(f"✔ 아이디어 저장: {text}")
                await redis.delete(_k(KEY_INBOX_PENDING, chat_id))
            except Exception as e:
                logger.warning(f"Notion 저장 실패: {e}")
                await query.answer("❌ 저장에 실패했습니다. 다시 시도해주세요", show_alert=True)

        elif data == "inbox:kind:할일":
            raw = await redis.get(_k(KEY_INBOX_PENDING, chat_id))
            if not raw:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return

            buttons = _build_date_buttons(today, "register")
            await query.edit_message_reply_markup(reply_markup=InlineKeyboardMarkup(buttons))

        elif data.startswith("inbox:date:"):
            date_iso = data.split(":")[-1]
            raw = await redis.get(_k(KEY_INBOX_PENDING, chat_id))
            if not raw:
                await query.edit_message_reply_markup(reply_markup=None)
                await query.message.reply_text("등록 정보가 만료됐어요. 다시 입력해주세요.")
                return

            pending = json.loads(raw)
            text = pending.get("text")

            try:
                await notion_service.add_inbox(text, "할일", date_iso)
                label = _format_date_label(date_iso, today)
                await query.edit_message_text(f"✔ 할일 저장 — {label}까지: {text}")
                await redis.delete(_k(KEY_INBOX_PENDING, chat_id))
            except Exception as e:
                logger.warning(f"Notion 저장 실패: {e}")
                await query.answer("❌ 저장에 실패했습니다. 다시 시도해주세요", show_alert=True)

        elif data.startswith("inbox:postpone:"):
            short_key = data.split(":")[-1]
            page_id = await redis.get(KEY_INBOX_CB.format(short_key=short_key))
            if not page_id:
                await query.answer("만료된 요청입니다")
                return

            buttons = _build_date_buttons(today, "postpone", short_key)
            await query.edit_message_reply_markup(reply_markup=_replace_row_by_callback_prefix(
                query.message.reply_markup, f"inbox:postpone:{short_key}", buttons
            ))

        elif data.startswith("inbox:postpone_date:"):
            parts = data.split(":")
            short_key = parts[2]
            date_iso = parts[3]

            page_id = await redis.get(KEY_INBOX_CB.format(short_key=short_key))
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
            short_key = data.split(":")[-1]
            page_id = await redis.get(KEY_INBOX_CB.format(short_key=short_key))
            if not page_id:
                await query.answer("만료된 요청입니다")
                return

            try:
                await notion_service.update_inbox_status(page_id, "완료")
                await query.answer("✔ 완료 처리되었습니다")
            except Exception as e:
                logger.warning(f"Notion 업데이트 실패: {e}")
                await query.answer("❌ 저장에 실패했습니다. 다시 시도해주세요", show_alert=True)

    except Exception as e:
        logger.error(f"inbox_callback 오류: {e}")
        await query.answer("오류가 발생했습니다", show_alert=True)
