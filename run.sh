#!/bin/bash
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Diary App - Docker 로컬 실행"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Docker 소켓 자동 탐색 ──────────────────────────────────────────────────────
DOCKER_SOCK=""
CANDIDATE_SOCKS=(
  "/Users/seojuan/.docker/run/docker.sock"
  "$HOME/.docker/run/docker.sock"
  "/var/run/docker.sock"
)

for sock in "${CANDIDATE_SOCKS[@]}"; do
  if [ -S "$sock" ] && DOCKER_HOST="unix://${sock}" docker info > /dev/null 2>&1; then
    DOCKER_SOCK="$sock"
    break
  fi
done

if [ -z "$DOCKER_SOCK" ]; then
  echo ""
  echo "  ❌ Docker Desktop이 실행 중이지 않습니다."
  echo "  Docker Desktop을 먼저 실행한 후 다시 시도하세요."
  echo ""
  exit 1
fi

export DOCKER_HOST="unix://${DOCKER_SOCK}"
export DOCKER_CONTEXT=default
echo "  Docker 소켓: ${DOCKER_SOCK}"

# ── 포트 정리 ─────────────────────────────────────────────────────────────────
for PORT in 8000 3000; do
  PID=$(lsof -ti tcp:${PORT} 2>/dev/null || true)
  if [ -n "$PID" ]; then
    echo "포트 ${PORT} 정리 중..."
    kill -9 $PID 2>/dev/null || true
    sleep 1
  fi
done

# ── 기존 컨테이너 정리 ────────────────────────────────────────────────────────
docker compose down --remove-orphans 2>/dev/null || true

# ── 빌드 & 실행 ───────────────────────────────────────────────────────────────
echo "빌드 중..."
docker compose build && docker compose up -d

echo ""
echo "  앱:       http://localhost:3000"
echo "  API:      http://localhost:8000"
echo "  API 문서: http://localhost:8000/docs"
echo "  어드민:   http://localhost:3000/admin"
echo ""

sleep 1 && open http://localhost:3000 2>/dev/null || true
docker compose logs -f
