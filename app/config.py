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

    # On-premise LLM (sLLM via Cloudflare 고정 IP)
    onpremise_llm_url: str = "https://api.kpmgpoc-samsungfire.com/v1"
    onpremise_llm_model: str = "LFM2"

    # Realtime provider 분기 ("openai" | "azure")
    realtime_provider: str = "openai"

    # Azure OpenAI (Foundry) — realtime_provider="azure"일 때만 사용
    # endpoint는 host만 권장 (예: https://<resource>.cognitiveservices.azure.com).
    # path/쿼리가 붙어와도 코드에서 scheme+host만 추출함.
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_realtime_deployment: str = "gpt-realtime-2"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
