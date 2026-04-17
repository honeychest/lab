import logging
from telegram.ext import ApplicationBuilder, MessageHandler, CallbackQueryHandler, CommandHandler, filters
from chs import dlog

logging.basicConfig(
  level=logging.INFO,
  format="%(asctime)s [%(levelname)s] %(message)s"
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)


application = None  # scheduler에서 bot 접근용 전역 참조


def main():
  global application
  from config import settings
  from handlers.refresh_handler import handle_refresh
  from handlers.text_handler import handle_text, handle_callback
  from handlers.quiz_handler import handle_quiz_command
  from handlers.law_handler import handle_law
  from handlers.exit_handler import handle_exit
  from handlers.help_handler import handle_help, handle_unknown_command  # 변경 신규 등록
  from handlers.inbox_handler import handle_inbox_callback               # 변경 신규 등록
  from scheduler import setup_scheduler

  dlog("MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text) — COMMAND 제외 전체 텍스트 수신")
  dlog("CommandHandler('help', handle_help) 신규 등록")
  dlog("MessageHandler(filters.COMMAND, handle_unknown_command) fallback 신규 등록")
  dlog("CallbackQueryHandler(handle_inbox_callback, pattern='^inbox') 신규 등록")

  logger.info("Nexus 봇 시작 중...")

  async def post_init(app):
    setup_scheduler(app.bot, settings.TELEGRAM_CHAT_ID)

  application = ApplicationBuilder().token(settings.TELEGRAM_BOT_TOKEN).post_init(post_init).build()

  # /quiz 명령어 → 즉시 퀴즈 시작 (전체 단어, mode=quiz)
  application.add_handler(CommandHandler("quiz", handle_quiz_command))
  # /law 명령어 → 법령 검색 모드 진입 또는 즉시 검색
  application.add_handler(CommandHandler("law", handle_law))
  # /exit 명령어 → 현재 모드(quiz/law) 종료 → 일반 모드 복귀
  application.add_handler(CommandHandler("exit", handle_exit))
  # /help 명령어 → 기능 목록 안내 (기존 미등록으로 단어 질문으로 빠지던 문제 해소)
  application.add_handler(CommandHandler("help", handle_help))
  # 미등록 명령어 fallback — 위 개별 CommandHandler 매칭 실패 시 "알 수 없는 명령어입니다"
  application.add_handler(MessageHandler(filters.COMMAND, handle_unknown_command))
  # 일반 텍스트 메시지 → text_handler (http/퀴즈/영문/한글 분기 포함)
  application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
  # 인라인 버튼 콜백
  application.add_handler(CallbackQueryHandler(handle_refresh, pattern="^refresh"))
  application.add_handler(CallbackQueryHandler(handle_callback, pattern="^(word|quiz|grammar)"))
  application.add_handler(CallbackQueryHandler(handle_inbox_callback, pattern="^inbox"))  # 변경 신규

  logger.info("Nexus 봇 시작 완료")
  application.run_polling()


if __name__ == "__main__":
  main()