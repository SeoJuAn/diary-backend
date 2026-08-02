"""
GET  /api/logs/stream  — SSE 실시간 로그 스트리밍
DELETE /api/logs/clear — 로그 버퍼 클리어
"""
import asyncio
import json
import hmac
from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from app.config import settings
from app.log_handler import log_buffer, log_subscribers

router = APIRouter(prefix="/api/logs", tags=["logs"])


def _check_admin_key(provided: str | None) -> None:
    if not settings.admin_api_key:
        # 관리자 키가 설정되지 않았으면 운영 로그 API는 항상 비활성화 (fail-closed)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="로그 API가 비활성화되어 있습니다.")
    if not provided or not hmac.compare_digest(provided, settings.admin_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="관리자 인증이 필요합니다.")


async def require_admin_sse(key: str | None = None) -> None:
    """
    SSE(EventSource)는 커스텀 헤더를 보낼 수 없으므로,
    쿼리 파라미터로 전달된 관리자 키를 검증한다. 일반 사용자 JWT로는 접근 불가 — 관리자 전용.
    """
    _check_admin_key(key)


async def require_admin_header(x_admin_key: str | None = Header(default=None)) -> None:
    _check_admin_key(x_admin_key)


@router.get("/stream")
async def stream_logs(_: None = Depends(require_admin_sse)):
    """
    SSE endpoint — 관리자 전용 (?key=<ADMIN_API_KEY> 쿼리 파라미터로 인증).
    연결 즉시 기존 버퍼 전송 후 신규 로그를 실시간 push.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=200)
    log_subscribers.append(queue)

    async def event_generator():
        try:
            # 1) 기존 버퍼 (히스토리) 먼저 전송
            for entry in list(log_buffer):
                yield f"data: {json.dumps(entry, ensure_ascii=False)}\n\n"

            # 2) 연결 유지 핑
            yield f"data: {json.dumps({'level': 'SYSTEM', 'msg': '✅ SSE 연결됨 — 실시간 로그 수신 시작', 'ts': '', 'emoji': '📡', 'name': 'sse'}, ensure_ascii=False)}\n\n"

            # 3) 신규 로그 실시간 push
            while True:
                try:
                    entry = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(entry, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    # keep-alive ping
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            if queue in log_subscribers:
                log_subscribers.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.delete("/clear")
async def clear_logs(_: None = Depends(require_admin_header)):
    log_buffer.clear()
    return {"success": True, "message": "로그가 클리어되었습니다."}
