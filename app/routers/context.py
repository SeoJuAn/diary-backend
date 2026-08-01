import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.database import query_one
from app.config import settings

router = APIRouter(prefix="/api/context", tags=["context"])
logger = logging.getLogger("context")

DEFAULT_PROMPT = """다음 대화 내용을 분석하여 주요 컨텍스트를 추출해주세요:
1. 대화의 주요 주제
2. 사용자의 의도나 목적
3. 중요한 정보나 키워드
4. 감정 상태나 톤
5. 대화의 흐름 요약

결과는 간결하게 불릿 포인트 형식으로 정리해주세요."""


class ExtractRequest(BaseModel):
    conversationText: str


@router.post("/extract")
async def extract_context(body: ExtractRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]

    row = await query_one(
        """SELECT prompt FROM prompt_versions
           WHERE endpoint = 'context-extract' AND is_current = true
             AND (user_id = $1::uuid OR user_id IS NULL)
           ORDER BY CASE WHEN user_id = $1::uuid THEN 0 ELSE 1 END
           LIMIT 1""",
        user_id,
    )
    system_prompt = row["prompt"] if row else DEFAULT_PROMPT

    result = await _extract_openai(body.conversationText, system_prompt)
    return {"success": True, "context": result}


async def _extract_openai(text: str, system_prompt: str) -> str:
    text_api_key = settings.opencode_api_key or settings.openai_api_key
    text_base_url = settings.openai_text_base_url or settings.openai_base_url
    logger.info(f"🌐 LLM 호출 (OpenCode Go) — POST {text_base_url}/chat/completions (model={settings.openai_text_model})")
    payload = {
        "model": settings.openai_text_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"다음 대화를 분석해주세요:\n\n{text}"},
        ],
        "max_tokens": 2000,
    }

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{text_base_url}/chat/completions",
            headers={"Authorization": f"Bearer {text_api_key}"},
            json=payload,
        )
    if not resp.is_success:
        logger.error(f"❌ OpenAI LLM 오류: {resp.status_code} — {resp.text[:300]}")
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]
