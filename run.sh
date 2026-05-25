#!/bin/bash
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Diary App - Docker 로컬 실행"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 기존 컨테이너 정리 (docker가 가진 포트는 여기서 해제됨) ──────────────────
docker compose down --remove-orphans 2>/dev/null || true

# ── 포트 정리 (docker-proxy는 절대 건드리지 않음 — Docker Desktop 데몬 꼬임 방지) ──
# docker compose down 후에도 남아있는 외부 프로세스(로컬 npm run dev / uvicorn 등)만 제거.
for PORT in 8000 3000; do
  PID=$(lsof -ti tcp:${PORT} 2>/dev/null || true)
  if [ -n "$PID" ]; then
    CMD=$(ps -p "$PID" -o comm= 2>/dev/null | tr -d ' ')
    case "$CMD" in
      *docker-proxy*|*com.docker*)
        # Docker Desktop이 관리하는 프로세스 — 건드리면 데몬이 깨짐
        continue
        ;;
    esac
    echo "포트 ${PORT} 외부 프로세스 정리 중 (PID=$PID, cmd=$CMD)..."
    kill -9 $PID 2>/dev/null || true
    sleep 1
  fi
done

# ── 빌드 & 실행 ───────────────────────────────────────────────────────────────
echo "빌드 중..."
docker compose up -d --build

echo ""
echo "  앱:       http://localhost:3000"
echo "  API:      http://localhost:8000"
echo "  API 문서: http://localhost:8000/docs"
echo "  어드민:   http://localhost:3000/admin"
echo ""

sleep 1 && open http://localhost:3000 2>/dev/null || true
docker compose logs -f
