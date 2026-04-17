import logging

from telegram import Update
from telegram.ext import ContextTypes

logger = logging.getLogger(__name__)


async def handle_help(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    help_text = """📖 Nexus 기능 목록
/quiz — 영단어 퀴즈 즉시 시작
/law — 법령 검색
/exit — 현재 모드 종료
영어 단어/문장 — 단어 분석 및 등록
한글 입력 — 할일/아이디어 등록
URL 전송 — 웹/YouTube/GitHub 요약 저장"""
    await update.message.reply_text(help_text)


async def handle_unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("알 수 없는 명령어입니다")
