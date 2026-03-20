import logging
from telegram.ext import ApplicationBuilder, MessageHandler, filters

logging.basicConfig(
  level=logging.INFO,
  format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


def main():
  from config import settings
  from handlers.url_handler import handle_url

  logger.info("Nexus 봇 시작 중...")

  app = ApplicationBuilder().token(settings.TELEGRAM_BOT_TOKEN).build()
  app.add_handler(MessageHandler(filters.TEXT & filters.Entity("url"), handle_url)) # 특정조건의 메시지("url")가 오면 지정한 함수 실행

  logger.info("Nexus 봇 시작 완료")
  app.run_polling()


if __name__ == "__main__":
  main()