import logging
from telegram.ext import ApplicationBuilder, MessageHandler, CallbackQueryHandler, CommandHandler, filters

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
  from handlers.url_handler import handle_url
  from handlers.refresh_handler import handle_refresh
  from handlers.text_handler import handle_text, handle_callback
  from handlers.quiz_handler import handle_quiz_command
  from handlers.law_handler import handle_law
  from handlers.exit_handler import handle_exit
  from scheduler import setup_scheduler

  logger.info("Nexus 봇 시작 중...")

  async def post_init(app):
    # event loop 실행 후 스케줄러 시작 (run_polling 진입 직후 호출됨)
    setup_scheduler(app.bot, settings.TELEGRAM_CHAT_ID)

  application = ApplicationBuilder().token(settings.TELEGRAM_BOT_TOKEN).post_init(post_init).build()

  # /quiz 명령어 → 즉시 퀴즈 시작 (카운트 초기화 포함)
  application.add_handler(CommandHandler("quiz", handle_quiz_command))
  # /law 명령어 → 법령 검색 모드 진입 또는 즉시 검색
  application.add_handler(CommandHandler("law", handle_law))
  # /exit 명령어 → 현재 모드(quiz/law) 종료 → 일반 모드 복귀
  application.add_handler(CommandHandler("exit", handle_exit))
  # URL 포함 메시지 → url_handler (필터 우선순위: URL이 있으면 여기서 처리)
  application.add_handler(MessageHandler(filters.TEXT & filters.Entity("url"), handle_url))
  # 일반 텍스트 메시지 → text_handler (단어질문 / 퀴즈 답변)
  application.add_handler(MessageHandler(filters.TEXT & ~filters.Entity("url"), handle_text))
  # 인라인 버튼 콜백 → handle_callback (refresh) 또는 handle_callback (퀴즈/단어)
  application.add_handler(CallbackQueryHandler(handle_refresh, pattern="^refresh"))
  application.add_handler(CallbackQueryHandler(handle_callback, pattern="^(word|quiz|grammar)"))

  logger.info("Nexus 봇 시작 완료")
  application.run_polling()


if __name__ == "__main__":
  main()