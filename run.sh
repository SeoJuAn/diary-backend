#!/bin/bash
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Diary App - Docker 로컬 실행"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Docker Desktop 자동 실행 + 대기 ───────────────────────────────────────────
SOCK="/Users/seojuan/.docker/run/docker.sock"

# 소켓이 실제로 응답하는지 Python으로 체크 (파일 존재만으로는 불충분)
sock_alive() {
  python3 -c "
import socket, sys
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
try:
    s.connect('$SOCK'); s.close(); sys.exit(0)
except: sys.exit(1)
" 2>/dev/null
}

if ! sock_alive; then
  echo "  Docker Desktop 시작 중..."
  open -a Docker 2>/dev/null || true
  echo -n "  대기 중"
  for i in $(seq 1 24); do
    sleep 5
    echo -n "."
    if sock_alive; then
      echo " 완료!"
      break
    fi
    if [ $i -eq 24 ]; then
      echo ""
      echo "  ❌ Docker Desktop 시작 실패 (2분 초과)"
      echo "  Docker Desktop을 수동으로 실행 후 다시 시도하세요."
      exit 1
    fi
  done
fi

export DOCKER_HOST="unix://${SOCK}"
export DOCKER_CONTEXT=desktop-linux

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
