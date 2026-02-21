from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import time

from app.log_handler import setup_logging
from app.database import get_pool, close_pool
from app.routers import auth, realtime, diary, context, audio, conversations, presets, prompts, search
from app.routers import logs as logs_router

# ── 로깅 시스템 초기화 (가장 먼저) ─────────────────────────────────────────────
logger = setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Diary Backend 시작 중...")
    await get_pool()
    logger.info("✅ PostgreSQL 연결 풀 준비 완료")
    yield
    await close_pool()
    logger.info("👋 서버 종료 — DB 풀 해제")


app = FastAPI(title="Diary Backend API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 요청/응답 로깅 미들웨어 ──────────────────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.time()
    method = request.method
    path = request.url.path

    # SSE 엔드포인트 자체는 스킵 (무한 루프 방지)
    if path == "/api/logs/stream":
        return await call_next(request)

    logger.info(f"→ {method} {path}")
    try:
        response = await call_next(request)
        elapsed = (time.time() - start) * 1000
        status = response.status_code
        emoji = "✅" if status < 400 else ("⚠️" if status < 500 else "❌")
        logger.info(f"{emoji} {method} {path} → {status} ({elapsed:.0f}ms)")
        return response
    except Exception as e:
        elapsed = (time.time() - start) * 1000
        logger.error(f"❌ {method} {path} → EXCEPTION: {e} ({elapsed:.0f}ms)")
        raise


app.include_router(auth.router)
app.include_router(realtime.router)
app.include_router(diary.router)
app.include_router(context.router)
app.include_router(audio.router)
app.include_router(conversations.router)
app.include_router(presets.router)
app.include_router(prompts.router)
app.include_router(search.router)
app.include_router(logs_router.router)


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "2.0.0"}
