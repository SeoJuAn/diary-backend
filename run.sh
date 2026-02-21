#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Diary App - Docker 로컬 실행"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 포트 정리
for PORT in 8000 3000; do
  PID=$(lsof -ti tcp:${PORT} 2>/dev/null)
  if [ -n "$PID" ]; then
    echo "포트 ${PORT} 정리 중..."
    kill -9 $PID 2>/dev/null || true
    sleep 1
  fi
done

# 기존 컨테이너 정리
docker compose down --remove-orphans 2>/dev/null || true

# 빌드 & 실행 (buildx 비활성화)
echo "빌드 중..."
DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 docker compose build && docker compose up -d

echo ""
echo "  앱:       http://localhost:3000"
echo "  API:      http://localhost:8000"
echo "  API 문서: http://localhost:8000/docs"
echo "  어드민:   http://localhost:3000/admin"
echo ""

sleep 1 && open http://localhost:3000 2>/dev/null || true
docker compose logs -f
