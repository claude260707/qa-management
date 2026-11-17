#!/usr/bin/env bash
# 서버 업데이트 배포 스크립트
# 사용법: cd ~/qa-management && ./deploy.sh
#
# 서버의 buildx(0.12)가 docker compose v5의 요구 버전(0.17+)보다 낮아서
# `docker compose build` 대신 `docker build`로 이미지를 만들고 `--no-build`로 띄운다.
# 메모리(2GB) 절약을 위해 backend → frontend 순서로 하나씩 빌드한다.
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-8000}"

step() { echo; echo "==> $*"; }

step "git pull"
git pull --ff-only

step "backend 이미지 빌드"
docker build -t qa-management-backend ./backend

step "frontend 이미지 빌드"
docker build --build-arg VITE_API_URL=/api -t qa-management-frontend ./frontend

step "컨테이너 재시작 (docker compose up -d --no-build)"
docker compose up -d --no-build

step "상태 확인"
docker compose ps

echo
echo "/api/health 확인 중 (최대 30초)..."
for i in $(seq 1 15); do
  if body=$(curl -fsS "http://localhost:${PORT}/api/health" 2>/dev/null); then
    echo "OK: ${body}"
    step "이전 빌드로 생긴 dangling 이미지 정리"
    docker image prune -f
    echo
    echo "배포 완료: $(git log --oneline -1)"
    exit 0
  fi
  sleep 2
done

echo "FAIL: /api/health 응답 없음. backend 로그:" >&2
docker compose logs --tail 30 backend >&2
exit 1
