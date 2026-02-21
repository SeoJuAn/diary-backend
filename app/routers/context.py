import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI
from app.dependencies import get_current_user
from app.database import query_one
from app.config import settings

router = APIRouter(prefix="/api/context", tags=["context"])

DEFAULT_PROMPT = """다음 대화 내용을 분석하여 주요 컨텍스트를 추출해주세요:
1. 대화의 주요 주제
2. 사용자의 의도나 목적
3. 중요한 정보나 키워드
4. 감정 상태나 톤
5. 대화의 흐름 요약

결과는 간결하게 불릿 포인트 형식으로 정리해주세요."""


class ExtractRequest(BaseModel):
    conversationText: str
    llmProvider: str = "openai"


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

    if body.llmProvider == "onpremise":
        result = await _extract_onpremise(body.conversationText, system_prompt)
    else:
        result = await _extract_openai(body.conversationText, system_prompt)

    return {"success": True, "context": result}


async def _extract_openai(text: str, system_prompt: str) -> str:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"다음 대화를 분석해주세요:\n\n{text}"},
        ],
        temperature=0.3,
        max_tokens=1000,
    )
    return resp.choices[0].message.content or ""


async def _extract_onpremise(text: str, system_prompt: str) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{settings.onpremise_llm_url}/chat/completions",
            json={
                "model": settings.onpremise_llm_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"다음 대화를 분석해주세요:\n\n{text}"},
                ],
                "temperature": 0.3,
                "max_tokens": 1000,
            },
        )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]
