import json
import uuid
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.database import query_one, Transaction
from app.config import settings

router = APIRouter(prefix="/api/realtime", tags=["realtime"])
logger = logging.getLogger("realtime")

DEFAULT_INSTRUCTIONS = """당신은 친근하고 따뜻한 일기 작성 도우미입니다. 사용자의 하루 이야기를 경청하고 공감하며 대화를 이어가세요. 자연스럽게 질문하고 사용자가 더 많은 이야기를 할 수 있도록 격려해주세요.

[이전 기록 검색 도구 사용 기준]
get_conversation_history 함수는 아래 상황에서만 사용하세요:
- 사용자가 과거를 명시적으로 언급할 때: "저번에", "예전에", "지난번에", "저번 주", "지난주", 특정 날짜 등
- 사용자가 이전 대화 내용을 묻거나 비교를 요청할 때: "그때 뭐라고 했었지?", "전에도 이런 일이 있었나?"
- 시간에 걸친 패턴 파악이 필요할 때: 반복되는 목표, 감정, 습관 추적

다음 상황에서는 절대 사용하지 마세요:
- 오늘 하루 이야기를 나누는 중 (현재 대화 내용만으로 충분할 때)
- 단순한 안부, 감정 공감, 일반적인 격려
- 과거 언급 없이 진행되는 자연스러운 대화 흐름"""

DEFAULT_ADVANCED = {
    "temperature": 0.8,
    "speed": 1.0,
    "threshold": 0.5,
    "prefix_padding_ms": 300,
    "silence_duration_ms": 200,
    "idle_timeout_ms": None,
    "max_output_tokens": "inf",
    "noise_reduction": None,
    "truncation": "auto",
}

TOOLS = [
    {
        "type": "function",
        "name": "get_conversation_history",
        "description": (
            "사용자의 이전 일기/대화 기록을 검색합니다. "
            "사용자가 '저번에', '예전에', '지난번에', '저번 주' 등 과거를 명시적으로 언급하거나, "
            "특정 날짜·주제의 기억을 물어볼 때, 또는 반복 패턴 추적이 필요할 때만 호출하세요. "
            "현재 대화만으로 충분한 일반 대화에서는 호출하지 마세요. "
            "반환값: 날짜, 한줄 요약, 키워드, 감정 목록."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "조회할 날짜 (YYYY-MM-DD 형식). '어제'는 오늘 날짜 - 1일로 계산해서 전달.",
                },
                "keyword": {
                    "type": "string",
                    "description": "검색할 키워드 또는 주제. 예: '운동', '친구', '스트레스'",
                },
                "limit": {
                    "type": "number",
                    "description": "가져올 최대 개수. 기본값 5, 최대 10.",
                },
            },
            "required": [],
        },
    }
]


class SessionConfig(BaseModel):
    model: str
    voice: str | None = "alloy"
    instructions: str | None = None


class TokenRequest(BaseModel):
    sessionConfig: SessionConfig
    advancedConfig: dict | None = None


@router.post("/token")
async def get_token(body: TokenRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]
    logger.info(f"🎫 토큰 발급 요청 — user={user_id}, model={body.sessionConfig.model}")

    # 사용자 프롬프트 조회 (사용자 설정 우선, 없으면 시스템 기본값)
    instructions = body.sessionConfig.instructions
    if not instructions:
        row = await query_one(
            """SELECT prompt FROM prompt_versions
               WHERE endpoint = 'realtime' AND is_current = true
                 AND (user_id = $1::uuid OR user_id IS NULL)
               ORDER BY CASE WHEN user_id = $1::uuid THEN 0 ELSE 1 END
               LIMIT 1""",
            user_id,
        )
        instructions = row["prompt"] if row else DEFAULT_INSTRUCTIONS
        src = "사용자 커스텀" if (row and row.get("user_id")) else "시스템 기본값"
        logger.info(f"📝 프롬프트 로드: {src} — {instructions[:60]}...")

    # 사용자 어드밴스드 프리셋 조회 (사용자 설정 우선, 없으면 시스템 기본값)
    advanced = body.advancedConfig
    if not advanced:
        row = await query_one(
            """SELECT temperature, speed, threshold, prefix_padding_ms,
                      silence_duration_ms, idle_timeout_ms, max_output_tokens,
                      noise_reduction, truncation
               FROM advanced_presets
               WHERE endpoint = 'realtime' AND is_current = true
                 AND (user_id = $1::uuid OR user_id IS NULL)
               ORDER BY CASE WHEN user_id = $1::uuid THEN 0 ELSE 1 END
               LIMIT 1""",
            user_id,
        )
        advanced = dict(row) if row else {}

    final_advanced = {**DEFAULT_ADVANCED, **advanced}
    logger.info(
        f"⚙️  파라미터 — temp={final_advanced['temperature']}, "
        f"speed={final_advanced['speed']}, "
        f"VAD threshold={final_advanced['threshold']}, "
        f"silence={final_advanced['silence_duration_ms']}ms"
    )

    # OpenAI Ephemeral Token 발급
    payload = {
        "model": body.sessionConfig.model,
        "voice": body.sessionConfig.voice or "alloy",
        "instructions": instructions,
        "input_audio_transcription": {"model": "whisper-1"},
        "turn_detection": {
            "type": "server_vad",
            "threshold": float(final_advanced["threshold"]),
            "prefix_padding_ms": int(final_advanced["prefix_padding_ms"]),
            "silence_duration_ms": int(final_advanced["silence_duration_ms"]),
            "create_response": True,
        },
        "tools": TOOLS,
        "tool_choice": "auto",
    }

    logger.info(f"🌐 OpenAI Realtime API 호출 중 — POST /v1/realtime/sessions")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.openai.com/v1/realtime/sessions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if not resp.is_success:
        logger.error(f"❌ OpenAI API 오류: {resp.status_code} — {resp.text[:200]}")
        raise HTTPException(status_code=resp.status_code, detail=f"OpenAI API 오류: {resp.text}")

    data = resp.json()
    session_id = data.get("id", str(uuid.uuid4()))
    expires_at = data["client_secret"].get("expires_at")
    logger.info(f"✅ Ephemeral 토큰 발급 성공 — session={session_id}, expires={expires_at}")
    logger.info(f"🔗 WebRTC 연결 준비 완료 — 클라이언트에 토큰 전달")

    return {
        "success": True,
        "token": data["client_secret"]["value"],
        "sessionId": session_id,
        "expiresAt": expires_at,
        "config": {
            "model": body.sessionConfig.model,
            "voice": body.sessionConfig.voice or "alloy",
            "advancedConfig": final_advanced,
        },
    }


class MessageItem(BaseModel):
    role: str
    content: str
    turn_index: int = 0


class SummaryData(BaseModel):
    oneLiner: str | None = None
    dailyHighlights: list[str] = []
    goalTracking: list[str] = []
    gratitude: list[str] = []
    emotions: list[str] = []
    fullDiary: str | None = None


class ContextData(BaseModel):
    keywords: list[str] = []
    mainTopics: list[str] = []
    contextSummary: str | None = None


class EndSessionRequest(BaseModel):
    sessionId: str
    duration: int = 0
    messageCount: int = 0
    endedBy: str = "user"
    messages: list[MessageItem] = []
    summary: SummaryData = SummaryData()
    context: ContextData = ContextData()


@router.post("/end")
async def end_session(body: EndSessionRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]
    logger.info(
        f"🏁 세션 종료 — session={body.sessionId}, "
        f"user={user_id}, duration={body.duration}s, "
        f"messages={body.messageCount}"
    )

    # 키워드 평문 텍스트 (검색 인덱스용)
    keywords_text = " ".join(body.context.keywords) if body.context.keywords else ""

    async with Transaction() as conn:
        # conversation_sessions upsert
        session_row = await conn.fetchrow(
            """INSERT INTO conversation_sessions (
                 user_id, session_id,
                 ended_at, duration_seconds, message_count, ended_by,
                 one_liner, daily_highlights, goal_tracking, gratitude, emotions, full_diary,
                 keywords, main_topics, context_summary, keywords_text
               ) VALUES (
                 $1::uuid, $2,
                 NOW(), $3, $4, $5,
                 $6, $7, $8, $9, $10, $11,
                 $12, $13, $14, $15
               )
               ON CONFLICT (session_id) DO UPDATE SET
                 ended_at         = NOW(),
                 duration_seconds = EXCLUDED.duration_seconds,
                 message_count    = EXCLUDED.message_count,
                 ended_by         = EXCLUDED.ended_by,
                 one_liner        = EXCLUDED.one_liner,
                 daily_highlights = EXCLUDED.daily_highlights,
                 goal_tracking    = EXCLUDED.goal_tracking,
                 gratitude        = EXCLUDED.gratitude,
                 emotions         = EXCLUDED.emotions,
                 full_diary       = EXCLUDED.full_diary,
                 keywords         = EXCLUDED.keywords,
                 main_topics      = EXCLUDED.main_topics,
                 context_summary  = EXCLUDED.context_summary,
                 keywords_text    = EXCLUDED.keywords_text,
                 updated_at       = NOW()
               RETURNING id""",
            user_id,
            body.sessionId,
            body.duration,
            body.messageCount or len(body.messages),
            body.endedBy,
            body.summary.oneLiner,
            json.dumps(body.summary.dailyHighlights, ensure_ascii=False),
            json.dumps(body.summary.goalTracking, ensure_ascii=False),
            json.dumps(body.summary.gratitude, ensure_ascii=False),
            json.dumps(body.summary.emotions, ensure_ascii=False),
            body.summary.fullDiary,
            json.dumps(body.context.keywords, ensure_ascii=False),
            json.dumps(body.context.mainTopics, ensure_ascii=False),
            body.context.contextSummary,
            keywords_text,
        )

        internal_id = session_row["id"]

        if body.messages:
            await conn.execute(
                "DELETE FROM conversation_messages WHERE session_id = $1", internal_id
            )
            await conn.executemany(
                """INSERT INTO conversation_messages (session_id, role, content, turn_index, created_at)
                   VALUES ($1, $2, $3, $4, NOW())""",
                [
                    (
                        internal_id,
                        "assistant" if m.role == "assistant" else "user",
                        m.content.strip(),
                        m.turn_index,
                    )
                    for m in body.messages
                ],
            )

    logger.info(
        f"✅ 세션 저장 완료 — dbId={internal_id}, "
        f"messages={len(body.messages)}, summary={bool(body.summary.oneLiner)}"
    )
    return {
        "success": True,
        "message": "대화 기록이 저장되었습니다.",
        "sessionDbId": str(internal_id),
        "sessionId": body.sessionId,
        "savedMessages": len(body.messages),
    }
