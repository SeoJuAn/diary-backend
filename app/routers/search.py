"""
POST /api/search  — Tavily 웹 검색 (AI Tool Use용)
"""
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter(prefix="/api/search", tags=["search"])
logger = logging.getLogger("search")

TAVILY_URL = "https://api.tavily.com/search"


class SearchRequest(BaseModel):
    query: str
    max_results: int = 5


@router.post("")
async def web_search(body: SearchRequest, current_user: dict = Depends(get_current_user)):
    if not settings.tavily_api_key:
        raise HTTPException(status_code=503, detail="웹 검색 기능이 설정되지 않았습니다.")

    logger.info(f"🔍 웹 검색 — query={body.query!r}, user={current_user['userId']}")

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            TAVILY_URL,
            json={
                "api_key": settings.tavily_api_key,
                "query": body.query,
                "search_depth": "basic",
                "max_results": min(body.max_results, 5),
                "include_answer": True,       # Tavily가 직접 요약 답변 제공
                "include_raw_content": False,
            },
        )

    if not resp.is_success:
        logger.error(f"❌ Tavily API 오류: {resp.status_code} — {resp.text[:200]}")
        raise HTTPException(status_code=502, detail="웹 검색 중 오류가 발생했습니다.")

    data = resp.json()
    answer = data.get("answer", "")
    results = data.get("results", [])

    logger.info(f"✅ 웹 검색 완료 — {len(results)}개 결과, answer={bool(answer)}")

    return {
        "success": True,
        "answer": answer,
        "results": [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", "")[:300],  # 300자 제한
                "score": r.get("score", 0),
            }
            for r in results
        ],
    }
