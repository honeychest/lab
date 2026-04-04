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


# ─── AM 9:00 퀴즈 시작 ────────────────────────────────────────────────────────
async def start_daily_quiz(bot: Bot, chat_id: int) -> None:
    """매일 AM 9:00 — 오늘 퀴즈 카운트 초기화 후 첫 문제 출제."""
    ttl = _seconds_until_midnight()

    # 오늘 퀴즈 카운트 초기화 (20개)
    count_key = _k(KEY_QUIZ_COUNT, chat_id)
    await redis.set(count_key, DAILY_QUIZ_LIMIT, ex=ttl)

    # 오늘 리뷰할 단어 조회
    due_words = await notion_service.get_words_due()
    if not due_words:
        await bot.send_message(chat_id=chat_id, text="오늘 복습할 단어가 없어요! 새 단어를 추가해봐요 😊")
        return

    # 유효한 첫 번째 단어 찾기 (비어있는 페이지 건너뜀)
    parsed = None
    for page in due_words:
        parsed = notion_service.parse_word_page(page)
        if parsed:
            break

    if not parsed:
        await bot.send_message(chat_id=chat_id, text="오늘 복습할 단어가 없어요! 새 단어를 추가해봐요 😊")
        return

    word       = parsed["word"]       # 정답 단어
    meaning_ko = parsed["meaning_ko"] # 한국어 뜻
    stage      = parsed["stage"]      # 현재 단계
    page_id    = parsed["page_id"]    # Notion page_id

    question = await ai_service.generate_quiz(word, meaning_ko, stage)

    # 퀴즈 세션 저장
    await redis.set(
        _k(KEY_QUIZ_SESSION, chat_id),
        json.dumps({"word": word, "meaning_ko": meaning_ko, "stage": stage, "page_id": page_id, "question": question}),
        ex=ttl,
    )
    await redis.set(_k(KEY_QUIZ_STATE, chat_id), "quiz", ex=ttl)

    # 첫 문제 출제
    buttons = [
        [
            InlineKeyboardButton("💡 힌트", callback_data="quiz:hint"),
            InlineKeyboardButton("🔤 단어 질문", callback_data="quiz:word_query"),
            InlineKeyboardButton("⏸ 중지", callback_data="quiz:pause"),
        ],
    ]
    await bot.send_message(
        chat_id=chat_id,
        text=f"🌅 오늘의 퀴즈 시작!\n[1/{DAILY_QUIZ_LIMIT}] {'✏️ 작문' if stage == 3 else '🧩'} {stage}단계\n{question}",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


# ─── 일시정지 후 10분 단발 알림 ───────────────────────────────────────────────
async def _send_resume_prompt(bot: Bot, chat_id: int) -> None:
    """일시정지 10분 후 — 퀴즈 재개 여부 확인 메시지 전송."""
    # pause 키가 이미 삭제됐으면 (사용자가 이미 재개) 무시
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
        args=[_bot, chat_id],          # setup_scheduler에서 저장된 bot 사용
        id=f"resume_{chat_id}",        # 동일 chat_id 중복 등록 방지용 id
        replace_existing=True,          # 이미 있으면 덮어씀 (재일시정지 시 타이머 리셋)
    )
    logger.info(f"퀴즈 재개 알림 예약 — chat_id: {chat_id}, 실행: {run_at}")


# ─── 스케줄러 등록 (main.py에서 호출) ────────────────────────────────────────
def setup_scheduler(bot: Bot, chat_id: int) -> None:
    """AM 9:00 퀴즈 시작 job 등록 후 스케줄러 시작."""
    global _bot
    _bot = bot  # schedule_quiz_resume에서 사용할 bot 저장
    scheduler.add_job(
        start_daily_quiz,
        trigger=CronTrigger(hour=9, minute=0),  # 매일 AM 9:00
        args=[bot, chat_id],
        id="daily_quiz",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("스케줄러 시작 완료 — 매일 AM 9:00 퀴즈 출제")
