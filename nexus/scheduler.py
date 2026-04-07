import json
import logging
from datetime import datetime, timedelta

import redis.asyncio as aioredis
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup

from config import settings
from handlers.text_handler import (
    KEY_QUIZ_COUNT,
    KEY_QUIZ_PAUSE,
    KEY_QUIZ_SESSION,
    KEY_QUIZ_STATE,
    DAILY_QUIZ_LIMIT,
    _k,
    _seconds_until_midnight,
)
from services import ai_service, notion_service

logger = logging.getLogger(__name__)

# Redis 클라이언트
redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

# APScheduler 인스턴스 (main.py에서 start() 호출)
scheduler = AsyncIOScheduler()

# bot 인스턴스 저장 (setup_scheduler 호출 시 주입, schedule_quiz_resume에서 사용)
_bot: Bot | None = None

# ─── 퀴즈 시간 설정 ───────────────────────────────────────────────────────────
QUIZ_SCHEDULES = [
    {"hour": 9,  "greeting": "🌅 오늘의 퀴즈 시작!",   "id": "quiz_am9"},
    {"hour": 15, "greeting": "🌆 이어서 풀어봐요!",     "id": "quiz_pm3"},
    {"hour": 22, "greeting": "🌙 오늘 마지막 퀴즈!",   "id": "quiz_pm10"},
]


# ─── 공통 퀴즈 출제 ───────────────────────────────────────────────────────────
async def _send_quiz_question(bot: Bot, chat_id: int, greeting: str) -> None:
    """due 단어 조회 후 퀴즈 문제 출제. 공통 로직."""
    ttl = _seconds_until_midnight()

    due_words = await notion_service.get_words_due()
    if not due_words:
        await bot.send_message(chat_id=chat_id, text="오늘 복습할 단어가 없어요! 새 단어를 추가해봐요 😊")
        return

    parsed = None
    for page in due_words:
        parsed = notion_service.parse_word_page(page)
        if parsed:
            break

    if not parsed:
        await bot.send_message(chat_id=chat_id, text="오늘 복습할 단어가 없어요! 새 단어를 추가해봐요 😊")
        return

    word       = parsed["word"]
    meaning_ko = parsed["meaning_ko"]
    stage      = parsed["stage"]
    page_id    = parsed["page_id"]

    question = await ai_service.generate_quiz(word, meaning_ko, stage)

    await redis.set(
        _k(KEY_QUIZ_SESSION, chat_id),
        json.dumps({"word": word, "meaning_ko": meaning_ko, "stage": stage, "page_id": page_id, "question": question}),
        ex=ttl,
    )
    await redis.set(_k(KEY_QUIZ_STATE, chat_id), "quiz", ex=ttl)

    buttons = [
        [
            InlineKeyboardButton("💡 힌트", callback_data="quiz:hint"),
            InlineKeyboardButton("🔤 단어 질문", callback_data="quiz:word_query"),
            InlineKeyboardButton("⏸ 중지", callback_data="quiz:pause"),
        ],
    ]
    count = await redis.get(_k(KEY_QUIZ_COUNT, chat_id))
    remaining = int(count) if count else DAILY_QUIZ_LIMIT
    await bot.send_message(
        chat_id=chat_id,
        text=f"{greeting}\n[{DAILY_QUIZ_LIMIT - remaining + 1}/{DAILY_QUIZ_LIMIT}] {'✏️ 작문' if stage == 3 else '🧩'} {stage}단계\n{question}",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


# ─── AM 9:00 퀴즈 시작 ────────────────────────────────────────────────────────
async def start_daily_quiz(bot: Bot, chat_id: int, greeting: str) -> None:
    """카운트 초기화 후 첫 문제 출제."""
    ttl = _seconds_until_midnight()
    await redis.set(_k(KEY_QUIZ_COUNT, chat_id), DAILY_QUIZ_LIMIT, ex=ttl)
    await _send_quiz_question(bot, chat_id, greeting)


# ─── PM 3:00 / PM 10:00 이어하기 ─────────────────────────────────────────────
async def resume_daily_quiz(bot: Bot, chat_id: int, greeting: str) -> None:
    """남은 퀴즈 있으면 이어서 출제. 완료 시 스킵."""
    count = await redis.get(_k(KEY_QUIZ_COUNT, chat_id))
    if count is not None and int(count) == 0:
        logger.info(f"오늘 퀴즈 완료 — {greeting} 스킵")
        return
    await _send_quiz_question(bot, chat_id, greeting)


# ─── 일시정지 후 10분 단발 알림 ───────────────────────────────────────────────
async def _send_resume_prompt(bot: Bot, chat_id: int) -> None:
    """일시정지 10분 후 — 퀴즈 재개 여부 확인 메시지 전송."""
    paused = await redis.get(_k(KEY_QUIZ_PAUSE, chat_id))
    if not paused:
        return

    buttons = [[
        InlineKeyboardButton("▶ 이어하기", callback_data="quiz:resume"),
        InlineKeyboardButton("오늘은 여기까지", callback_data="quiz:end"),
    ]]
    await bot.send_message(
        chat_id=chat_id,
        text="이어서 퀴즈 풀까요? 😊",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


async def schedule_quiz_resume(chat_id: int) -> None:
    """일시정지 시 호출 — 10분 후 재개 알림 단발 job 등록."""
    run_at = datetime.now() + timedelta(minutes=10)
    scheduler.add_job(
        _send_resume_prompt,
        trigger=DateTrigger(run_date=run_at),
        args=[_bot, chat_id],
        id=f"resume_{chat_id}",
        replace_existing=True,
    )
    logger.info(f"퀴즈 재개 알림 예약 — chat_id: {chat_id}, 실행: {run_at}")


# ─── 스케줄러 등록 (main.py에서 호출) ────────────────────────────────────────
def setup_scheduler(bot: Bot, chat_id: int) -> None:
    """퀴즈 스케줄 등록 후 스케줄러 시작."""
    global _bot
    _bot = bot

    for s in QUIZ_SCHEDULES:
        func = start_daily_quiz if s["hour"] == 9 else resume_daily_quiz
        scheduler.add_job(
            func,
            trigger=CronTrigger(hour=s["hour"], minute=0, timezone="Asia/Seoul"),
            args=[bot, chat_id, s["greeting"]],
            id=s["id"],
            replace_existing=True,
        )
        logger.info(f"퀴즈 스케줄 등록 — {s['hour']:02d}:00 KST ({s['id']})")

    scheduler.start()
    logger.info("스케줄러 시작 완료")
