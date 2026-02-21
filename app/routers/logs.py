"""
GET  /api/logs/stream  — SSE 실시간 로그 스트리밍
DELETE /api/logs/clear — 로그 버퍼 클리어
"""
import asyncio
import json
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from app.log_handler import log_buffer, log_subscribers

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/stream")
async def stream_logs():
    """
    SSE endpoint — 인증 없이 공개.
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
async def clear_logs():
    log_buffer.clear()
    return {"success": True, "message": "로그가 클리어되었습니다."}
