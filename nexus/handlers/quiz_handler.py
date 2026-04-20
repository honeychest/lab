import json
import logging
import random

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

from chs import dlog
from redis_client import (  # 변경 redis_client 공통 모듈에서 import
    redis, _k, _seconds_until_midnight, DAILY_QUIZ_LIMIT,
    KEY_QUIZ_COUNT, KEY_QUIZ_PAUSE, KEY_QUIZ_PREFETCH,
    KEY_QUIZ_SESSION, KEY_QUIZ_STATE,
)
from handlers.text_handler import _prefetch_next_question, _stage_icon, _quiz_buttons  # 퀴즈 로직은 text_handler 유지
dlog("redis_client 공통 모듈 + text_handler 퀴즈 로직 분리 import")
from services import ai_service, notion_service

logger = logging.getLogger(__name__)


async def handle_quiz_start_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """스케줄 메시지 [시작] 버튼 콜백."""
    import asyncio

    query = update.callback_query
    await query.answer()

    chat_id = query.message.chat_id
    dlog("잔존 일시정지 플래그 삭제 — 이전 세션 pause 상태가 남아있으면 분기 4 조건 실패 방지")
    await redis.delete(_k(KEY_QUIZ_PAUSE, chat_id))
    count_key = _k(KEY_QUIZ_COUNT, chat_id)
    count_str = await redis.get(count_key)

    if not count_str or int(count_str) <= 0:
        await query.answer("오늘 퀴즈를 모두 완료했어요 ✔", show_alert=True)
        return

    ttl = _seconds_until_midnight()

    due_words = await notion_service.get_words_due()
    if not due_words:
        await query.message.reply_text("오늘 복습할 단어가 없어요")
        return

    parsed = None
    for candidate in due_words:
        parsed = notion_service.parse_word_page(candidate)
        if parsed:
            break

    if not parsed:
        await query.message.reply_text("오늘 복습할 단어가 없어요")
        return

    word = parsed["word"]
    meaning_ko = parsed["meaning_ko"]
    stage = parsed["stage"]
    page_id = parsed["page_id"]

    loading = await query.message.reply_text("다음 문제 출제 중... ⏳")
    question = await ai_service.generate_quiz(word, meaning_ko, stage)
    await loading.delete()

    await redis.set(
        _k(KEY_QUIZ_SESSION, chat_id),
        json.dumps({"word": word, "meaning_ko": meaning_ko, "stage": stage, "page_id": page_id, "question": question, "mode": "auto"}),
        ex=ttl,
    )
    await redis.set(_k(KEY_QUIZ_STATE, chat_id), "quiz", ex=ttl)

    remaining = await redis.decr(count_key)
    await redis.expire(count_key, ttl)

    progress = f"[{DAILY_QUIZ_LIMIT - remaining}/{DAILY_QUIZ_LIMIT}]"
    body = f"{meaning_ko}\n\n{question}" if stage == 1 else question
    await query.message.reply_text(
        f"{progress} {_stage_icon(stage)} {stage}단계\n{body}",
        reply_markup=_quiz_buttons()
    )
    logger.info(f"스케줄 퀴즈 시작 — chat_id: {chat_id}, 단어: {word}, 단계: {stage}")

    asyncio.create_task(_prefetch_next_question(chat_id, "auto", page_id))


async def handle_quiz_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """/quiz 명령어 — 카운트 초기화 후 즉시 첫 문제 출제."""
    chat_id = update.effective_chat.id
    ttl = _seconds_until_midnight()

    # 기존 퀴즈 세션/일시정지/prefetch 초기화
    await redis.delete(_k(KEY_QUIZ_PAUSE, chat_id))
    dlog("/quiz 시작 시 prefetch 키 삭제 — mode 전환 대응")
    await redis.delete(_k(KEY_QUIZ_PREFETCH, chat_id))

    # 오늘 퀴즈 카운트 초기화 (20개)
    await redis.set(_k(KEY_QUIZ_COUNT, chat_id), DAILY_QUIZ_LIMIT, ex=ttl)

    # 전체 단어 조회 (자동출제 대상 제외, 다음리뷰일 오름차순)
    all_words = await notion_service.get_all_words()
    if not all_words:
        await update.message.reply_text("단어장이 비어있어요! 단어를 추가해봐요 😊")
        return

    # 상위 100개 내에서 셔플 (오래된 단어 위주이면서 매번 순서 다르게)
    pool = all_words[:100]
    random.shuffle(pool)

    # 유효한 첫 번째 단어 찾기 (비어있는 페이지 건너뜀)
    parsed = None
    for candidate in pool:
        parsed = notion_service.parse_word_page(candidate)
        if parsed:
            break

    if not parsed:
        await update.message.reply_text("유효한 단어가 없어요. 단어를 추가해봐요 😊")
        return

    word       = parsed["word"]       # 정답 단어
    meaning_ko = parsed["meaning_ko"] # 한국어 뜻
    stage      = parsed["stage"]      # 현재 단계
    page_id    = parsed["page_id"]    # Notion page_id

    loading = await update.message.reply_text("다음 문제 출제 중... ⏳")
    question = await ai_service.generate_quiz(word, meaning_ko, stage)
    await loading.delete()

    # 퀴즈 세션 저장 (첫 문제는 definition 없음)
    await redis.set(
        _k(KEY_QUIZ_SESSION, chat_id),
        json.dumps({"word": word, "meaning_ko": meaning_ko, "stage": stage, "page_id": page_id, "question": question, "mode": "quiz"}),
        ex=ttl,
    )
    await redis.set(_k(KEY_QUIZ_STATE, chat_id), "quiz", ex=ttl)

    # 첫 문제 출제
    buttons = [
        [
            InlineKeyboardButton("힌트", callback_data="quiz:hint"),
            InlineKeyboardButton("질문", callback_data="quiz:word_query"),
            InlineKeyboardButton("실패", callback_data="quiz:fail"),
            InlineKeyboardButton("중지", callback_data="quiz:pause"),
        ],
    ]
    body = f"{meaning_ko}\n\n{question}" if stage == 1 else question
    await update.message.reply_text(
        f"[🔄] {_stage_icon(stage)} {stage}단계\n{body}",
        reply_markup=InlineKeyboardMarkup(buttons),
    )
    logger.info(f"/quiz 시작 — chat_id: {chat_id}, 단어: {word}, 단계: {stage}")
    dlog("첫 문제 표시 후 다음 문제 prefetch 백그라운드 trigger — asyncio.create_task")
    import asyncio
    asyncio.create_task(_prefetch_next_question(chat_id, "quiz", page_id))
