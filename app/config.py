from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # OpenAI
    openai_api_key: str

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

    # On-premise LLM (optional)
    onpremise_llm_url: str = "https://api.kpmgpoc-samsungfire.com/v1"
    onpremise_llm_model: str = "LFM2-2.6B-Exp-Q8_0.gguf"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
