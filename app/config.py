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
    db_password: str

    # JWT
    jwt_access_secret: str
    jwt_refresh_secret: str
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

    # Admin (운영 로그 등 관리자 전용 API) — 미설정 시 해당 API는 완전 비활성화됨
    admin_api_key: str = ""

    # 운영 환경 여부 — production이면 OpenAPI docs 비활성화
    environment: str = "development"

    # 콤마로 구분된 허용 Origin 목록 (CORS). 실제 프론트 도메인을 반드시 추가하세요.
    cors_origins: str = "http://localhost:3000,http://localhost:3001,https://diary-backend-beta.vercel.app"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
