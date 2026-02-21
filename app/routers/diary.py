import json
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from openai import AsyncOpenAI
from app.dependencies import get_current_user
from app.database import query_one
from app.config import settings

router = APIRouter(prefix="/api", tags=["diary"])

DEFAULT_PROMPT = """당신은 친근하고 따뜻한 일기 작성 도우미입니다.
사용자가 말한 내용을 바탕으로 구조화된 일기 요약을 생성해주세요.

규칙:
1. 한국어로 작성하세요
2. 1인칭 시점을 유지하세요 (나는, 내가 등)
3. 감정과 느낌을 풍부하게 표현하세요
4. 각 카테고리에 해당하는 내용이 없으면 빈 배열로 반환하세요
5. 각 항목은 간결하게 2-4단어로 표현하세요
6. oneLiner는 오늘 하루를 대표하는 한 문장으로 작성하세요
7. fullDiary는 전체 내용을 자연스럽게 3-5문장으로 정리하세요"""

JSON_SCHEMA = {
    "name": "diary_summary",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "oneLiner": {"type": "string", "description": "오늘 하루를 대표하는 한 문장"},
            "dailyHighlights": {
                "type": "array",
                "items": {"type": "string"},
                "description": "오늘의 주요 일상 이벤트 (2-4단어씩)",
            },
            "goalTracking": {
                "type": "array",
                "items": {"type": "string"},
                "description": "오늘의 목표 달성 현황 (2-4단어씩)",
            },
            "gratitude": {
                "type": "array",
                "items": {"type": "string"},
                "description": "감사하거나 행복했던 것들 (2-4단어씩)",
            },
            "emotions": {
                "type": "array",
                "items": {"type": "string"},
                "description": "오늘 느낀 감정들 (1-2단어씩)",
            },
            "fullDiary": {"type": "string", "description": "전체 일기 내용 (3-5문장)"},
        },
        "required": ["oneLiner", "dailyHighlights", "goalTracking", "gratitude", "emotions", "fullDiary"],
        "additionalProperties": False,
    },
}


class OrganizeRequest(BaseModel):
    text: str
    llmProvider: str = "openai"


@router.post("/organize-diary")
async def organize_diary(body: OrganizeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]

    # 사용자 프롬프트 조회 (사용자 설정 우선, 없으면 시스템 기본값)
    row = await query_one(
        """SELECT prompt FROM prompt_versions
           WHERE endpoint = 'organize-diary' AND is_current = true
             AND (user_id = $1::uuid OR user_id IS NULL)
           ORDER BY CASE WHEN user_id = $1::uuid THEN 0 ELSE 1 END
           LIMIT 1""",
        user_id,
    )
    system_prompt = row["prompt"] if row else DEFAULT_PROMPT

    if body.llmProvider == "onpremise":
        return await _organize_onpremise(body.text, system_prompt)
    return await _organize_openai(body.text, system_prompt)


async def _organize_openai(text: str, system_prompt: str) -> dict:
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    resp = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"다음 대화 내용을 바탕으로 일기를 작성해주세요:\n\n{text}"},
        ],
        response_format={"type": "json_schema", "json_schema": JSON_SCHEMA},
        temperature=0.7,
        max_tokens=2000,
    )
    raw = resp.choices[0].message.content or "{}"
    summary = json.loads(raw)
    return {"success": True, "summary": summary}


async def _organize_onpremise(text: str, system_prompt: str) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{settings.onpremise_llm_url}/chat/completions",
            json={
                "model": settings.onpremise_llm_model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"다음 대화 내용을 바탕으로 일기를 작성해주세요:\n\n{text}"},
                ],
                "temperature": 0.7,
                "max_tokens": 2000,
            },
        )
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]
    try:
        summary = json.loads(raw)
    except Exception:
        summary = {"oneLiner": raw, "dailyHighlights": [], "goalTracking": [], "gratitude": [], "emotions": [], "fullDiary": raw}
    return {"success": True, "summary": summary}
