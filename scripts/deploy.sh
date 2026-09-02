#!/usr/bin/env bash
# Deploy software-agent on the production server (MediNexPlus host).
# Pulls latest main (or DEPLOY_BRANCH), rebuilds compose stack, runs smoke tests.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BRANCH="${DEPLOY_BRANCH:-main}"
export SMOKE_SKIP_PUBLIC="${SMOKE_SKIP_PUBLIC:-0}"
# Dedicated hosts (e.g. Contabo) won't run MediNexPlus; set SMOKE_SKIP_MEDINEX=1
export SMOKE_SKIP_MEDINEX="${SMOKE_SKIP_MEDINEX:-0}"

if [ "${DEPLOY_SKIP_GIT:-0}" != "1" ]; then
  echo "==> updating ${ROOT} from origin/${BRANCH}"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
else
  echo "==> skipping git pull (DEPLOY_SKIP_GIT=1)"
fi

mkdir -p "${HOST_WORKSPACE_ROOT:-/data/software-agent/workspaces}"

if [ "${SKIP_IDE_BUILD:-0}" != "1" ]; then
  echo "==> building IDE code-server images"
  BUILDX_NO_DEFAULT_ATTESTATIONS=1 docker compose -f apps/code-server/docker-compose.yml --profile build build
else
  echo "==> skipping IDE image build (SKIP_IDE_BUILD=1)"
fi

echo "==> building and starting software-agent stack"
BUILDX_NO_DEFAULT_ATTESTATIONS=1 docker compose build
docker compose up -d --remove-orphans

echo "==> running post-deploy smoke tests"
if ! bash "$ROOT/scripts/smoke-test.sh"; then
  echo "==> smoke failed — dumping logs"
  docker compose logs --tail=120 frontend backend worker postgres traefik || true
  exit 1
fi

docker compose ps
echo "==> deploy complete"
