from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # OpenAI — 모든 LLM 호출(텍스트/Realtime/STT/TTS)의 단일 경로
    openai_api_key: str
    openai_base_url: str = "https://api.openai.com/v1"

    # DB
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "tjkimdb"
    db_user: str = "tjkim"
    db_password: str = "1111"

    # JWT
    jwt_access_secret: str = "diary_access_secret_key_2026"
    jwt_refresh_secret: str = "diary_refresh_secret_key_2026"
    jwt_access_expires_in: int = 3600       # 1h in seconds
    jwt_refresh_expires_in: int = 604800    # 7d in seconds

    # Tavily (웹 검색)
    tavily_api_key: str = ""

    # ── 텍스트 LLM (organize-diary, context-extract) ──
    # OpenCode Go 직접 호출.
    # opencode_api_key 가 비어 있으면 기본 openai_api_key 로 폴백 (하위호환).
    opencode_api_key: str = ""
    openai_text_model: str = "gpt-5.6-luna"
    openai_text_base_url: str = "https://opencode.ai/zen/go/v1"

    # Realtime (WebRTC ephemeral token)
    openai_realtime_model: str = "gpt-realtime-2.1"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
