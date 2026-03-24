from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    TELEGRAM_BOT_TOKEN: str
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str
    NOTION_API_KEY: str
    NOTION_DATABASE_ID: str
    AI_PROVIDER: str = "gemini"
    GITHUB_TOKEN: str = ""
    GROQ_API_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()