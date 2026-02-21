from fastapi import APIRouter, Depends, Query
from app.dependencies import get_current_user
from app.database import query, query_one

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("/history")
async def get_history(
    sessionId: str | None = Query(None),
    date: str | None = Query(None),
    keyword: str | None = Query(None),
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["userId"]

    # 단일 세션 상세 조회
    if sessionId:
        session = await query_one(
            """SELECT cs.*, array_agg(
                 json_build_object(
                   'id', cm.id,
                   'role', cm.role,
                   'content', cm.content,
                   'turn_index', cm.turn_index,
                   'created_at', cm.created_at
                 ) ORDER BY cm.turn_index
               ) FILTER (WHERE cm.id IS NOT NULL) as messages
               FROM conversation_sessions cs
               LEFT JOIN conversation_messages cm ON cm.session_id = cs.id
               WHERE cs.user_id = $1::uuid AND cs.session_id = $2
               GROUP BY cs.id""",
            user_id, sessionId,
        )
        if not session:
            return {"success": True, "session": None}
        return {"success": True, "session": _format_session(session)}

    # 목록 조회 (날짜/키워드 필터)
    conditions = ["cs.user_id = $1::uuid", "cs.ended_at IS NOT NULL"]
    params: list = [user_id]
    idx = 2

    if date:
        conditions.append(f"DATE(cs.started_at AT TIME ZONE 'Asia/Seoul') = ${idx}::date")
        params.append(date)
        idx += 1

    if keyword:
        conditions.append(
            f"(cs.one_liner ILIKE ${idx} OR cs.context_summary ILIKE ${idx} "
            f"OR cs.keywords_text ILIKE ${idx})"
        )
        params.append(f"%{keyword}%")
        idx += 1

    where = " AND ".join(conditions)
    rows = await query(
        f"""SELECT cs.id, cs.session_id, cs.started_at, cs.ended_at,
                   cs.duration_seconds, cs.message_count,
                   cs.one_liner, cs.daily_highlights, cs.goal_tracking,
                   cs.gratitude, cs.emotions, cs.keywords, cs.main_topics,
                   cs.context_summary
            FROM conversation_sessions cs
            WHERE {where}
            ORDER BY cs.started_at DESC
            LIMIT ${idx} OFFSET ${idx+1}""",
        *params, limit, offset,
    )

    return {
        "success": True,
        "sessions": [_format_session(r) for r in rows],
        "limit": limit,
        "offset": offset,
    }


def _format_session(row) -> dict:
    import json as _json

    def _parse_json(v):
        if v is None:
            return []
        if isinstance(v, (list, dict)):
            return v
        try:
            return _json.loads(v)
        except Exception:
            return []

    result = dict(row)
    for key in ("daily_highlights", "goal_tracking", "gratitude", "emotions", "keywords", "main_topics"):
        result[key] = _parse_json(result.get(key))
    # UUID → str
    for key in ("id", "user_id"):
        if key in result and result[key] is not None:
            result[key] = str(result[key])
    return result
