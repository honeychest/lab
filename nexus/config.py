from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    TELEGRAM_BOT_TOKEN: str
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str
    NOTION_API_KEY: str
    NOTION_LINK_DATABASE_ID: str
    NOTION_WORD_DATABASE_ID: str
    NOTION_GRAMMAR_DATABASE_ID: str
    AI_PROVIDER: str = "gemini"
    GITHUB_TOKEN: str = ""
    GROQ_API_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    TELEGRAM_CHAT_ID: int  # 퀴즈 알림을 받을 텔레그램 chat_id

    class Config:
        env_file = ".env"


settings = Settings()