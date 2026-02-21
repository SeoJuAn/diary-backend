"""
SSE-based in-memory log system.
- Captures all Python logging output
- Stores last 500 entries in a deque
- Pushes new entries to all active SSE subscribers via asyncio.Queue
"""
import logging
import asyncio
from collections import deque
from datetime import datetime, timezone
from typing import List

# ── 전역 상태 ──────────────────────────────────────────────────────────────────
log_buffer: deque = deque(maxlen=500)
log_subscribers: List[asyncio.Queue] = []

# ── 레벨별 이모지 ──────────────────────────────────────────────────────────────
LEVEL_EMOJI = {
    "DEBUG":    "🔍",
    "INFO":     "✅",
    "WARNING":  "⚠️",
    "ERROR":    "❌",
    "CRITICAL": "🔥",
}


class SSELogHandler(logging.Handler):
    """로그 레코드를 buffer에 저장하고 모든 SSE 구독자에게 push합니다."""

    def emit(self, record: logging.LogRecord):
        try:
            msg = self.format(record)
            emoji = LEVEL_EMOJI.get(record.levelname, "•")
            entry = {
                "ts": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                "level": record.levelname,
                "emoji": emoji,
                "name": record.name,
                "msg": msg,
            }
            log_buffer.append(entry)
            # 모든 SSE 구독자에게 push (비동기 safe)
            for q in log_subscribers:
                try:
                    q.put_nowait(entry)
                except asyncio.QueueFull:
                    pass
        except Exception:
            self.handleError(record)


def setup_logging():
    """애플리케이션 시작 시 호출 — 모든 관련 로거에 SSE 핸들러 등록."""
    sse_handler = SSELogHandler()
    sse_handler.setLevel(logging.DEBUG)
    formatter = logging.Formatter("%(message)s")
    sse_handler.setFormatter(formatter)

    # 스트림 핸들러도 함께 등록 (콘솔 출력 유지)
    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%H:%M:%S"
    ))

    # 루트 로거
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(sse_handler)
    root_logger.addHandler(stream_handler)

    # uvicorn 로거 — 접근 로그 포함
    for name in ["uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"]:
        lg = logging.getLogger(name)
        lg.handlers = []
        lg.addHandler(sse_handler)
        lg.addHandler(stream_handler)
        lg.propagate = False

    # httpcore / httpx / openai 내부 로거 — DEBUG 노이즈 억제 (WARNING 이상만)
    for noisy in [
        "httpcore", "httpcore.connection", "httpcore.http11", "httpcore.http2",
        "httpx", "openai._base_client", "openai", "asyncio",
    ]:
        logging.getLogger(noisy).setLevel(logging.WARNING)

    return logging.getLogger("app")
