from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_pool, close_pool
from app.routers import auth, realtime, diary, context, audio, conversations, presets, prompts


@asynccontextmanager
async def lifespan(app: FastAPI):
    await get_pool()
    print("✅ Database pool connected")
    yield
    await close_pool()
    print("👋 Database pool closed")


app = FastAPI(title="Diary Backend API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(realtime.router)
app.include_router(diary.router)
app.include_router(context.router)
app.include_router(audio.router)
app.include_router(conversations.router)
app.include_router(presets.router)
app.include_router(prompts.router)


@app.get("/health")
async def health():
    return {"status": "healthy", "version": "2.0.0"}
