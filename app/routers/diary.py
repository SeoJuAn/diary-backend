import json
import logging
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.database import query_one
from app.config import settings

router = APIRouter(prefix="/api", tags=["diary"])
logger = logging.getLogger("diary")

DEFAULT_PROMPT = """당신은 친근하고 따뜻한 일기 작성 도우미입니다.
사용자가 말한 내용을 바탕으로 구조화된 일기 요약을 생성해주세요.

규칙:
1. 한국어로 작성하세요
2. 1인칭 시점을 유지하세요 (나는, 내가 등)
3. 감정과 느낌을 풍부하게 표현하세요
4. 각 카테고리에 해당하는 내용이 없으면 빈 배열로 반환하세요
5. 각 항목은 간결하게 2-4단어로 표현하세요
6. oneLiner는 오늘 하루를 대표하는 한 문장으로 작성하세요
7. fullDiary는 전체 내용을 자연스럽게 3-5문장으로 정리하세요

[출력 형식 — 매우 중요]
응답은 반드시 아래 키만 포함한 JSON 객체 하나만 출력하세요. 코드블록, 설명, 인사말 모두 금지.
{
  "oneLiner": "...",
  "dailyHighlights": ["..."],
  "goalTracking": ["..."],
  "gratitude": ["..."],
  "emotions": ["..."],
  "fullDiary": "..."
}"""

_EMPTY_SUMMARY_KEYS = ("dailyHighlights", "goalTracking", "gratitude", "emotions")


class OrganizeRequest(BaseModel):
    text: str


@router.post("/organize-diary")
async def organize_diary(body: OrganizeRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]

    row = await query_one(
        """SELECT prompt FROM prompt_versions
           WHERE endpoint = 'organize-diary' AND is_current = true
             AND (user_id = $1::uuid OR user_id IS NULL)
           ORDER BY CASE WHEN user_id = $1::uuid THEN 0 ELSE 1 END
           LIMIT 1""",
        user_id,
    )
    system_prompt = row["prompt"] if row else DEFAULT_PROMPT

    return await _organize_openai(body.text, system_prompt)


async def _organize_openai(text: str, system_prompt: str) -> dict:
    text_api_key = settings.opencode_api_key or settings.openai_api_key
    text_base_url = settings.openai_text_base_url or settings.openai_base_url
    logger.info(f"🌐 LLM 호출 (opencode-router) — POST {text_base_url}/chat/completions (model={settings.openai_text_model})")
    payload = {
        "model": settings.openai_text_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"다음 대화 내용을 바탕으로 일기를 작성해주세요. JSON 객체 하나만 출력:\n\n{text}"},
        ],
        "response_format": {"type": "json_object"},
        "max_tokens": 4000,
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
    raw = resp.json()["choices"][0]["message"]["content"]

    # 모델이 ```json ... ``` 으로 감싸거나 앞뒤 텍스트 붙일 수 있어 JSON 영역만 추출
    summary = _safe_parse_summary(raw)
    return {"success": True, "summary": summary}


def _safe_parse_summary(raw: str) -> dict:
    """LLM 출력에서 JSON object를 추출. 실패 시 raw 텍스트를 oneLiner+fullDiary로."""
    candidate = raw.strip()
    # ```json ... ``` 마크다운 코드블록 제거
    m = re.search(r"```(?:json)?\s*(.*?)```", candidate, flags=re.DOTALL)
    if m:
        candidate = m.group(1).strip()
    # 첫 { ... 마지막 } 만 잘라 시도
    if "{" in candidate and "}" in candidate:
        candidate = candidate[candidate.index("{"): candidate.rindex("}") + 1]
    try:
        parsed = json.loads(candidate)
        # 필수 키 기본값 채움
        for k in _EMPTY_SUMMARY_KEYS:
            parsed.setdefault(k, [])
        parsed.setdefault("oneLiner", "")
        parsed.setdefault("fullDiary", raw)
        return parsed
    except Exception as e:
        logger.warning(f"⚠️ LLM JSON 파싱 실패 ({e}) — raw fallback")
        return {
            "oneLiner": raw[:120],
            "dailyHighlights": [],
            "goalTracking": [],
            "gratitude": [],
            "emotions": [],
            "fullDiary": raw,
        }
