#!/usr/bin/env bash
# Deploy a tagged release of software-agent from GHCR.
#
# Usage: scripts/deploy.sh <image-tag>      (tag = git SHA pushed by .github/workflows/deploy.yml)
#
# Steps: record previous tag -> pull images -> pg_dump backup -> migrate -> up -d -> smoke test.
# Run as the non-root deploy user (member of the docker group) from the deploy directory.
set -euo pipefail

usage() {
  echo "usage: $0 <image-tag>" >&2
  exit 2
}

[ $# -eq 1 ] || usage
TAG="$1"
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "invalid tag: $TAG" >&2; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f .env ] || { echo "missing $ROOT/.env (copy .env.example and fill in secrets)" >&2; exit 1; }

env_get() {
  # Reads KEY from .env without sourcing it (values may contain PEM blocks / spaces).
  local line
  line="$(grep -E "^$1=" .env | tail -n1 || true)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

STATE_DIR="$ROOT/.deploy"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/software-agent}"
mkdir -p "$STATE_DIR" "$BACKUP_DIR/pre-deploy"

PREV_TAG="$(cat "$STATE_DIR/current_tag" 2>/dev/null || true)"
if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "$TAG" ]; then
  echo "$PREV_TAG" > "$STATE_DIR/previous_tag"
fi

export IMAGE_TAG="$TAG"
export GHCR_OWNER="${GHCR_OWNER:-$(env_get GHCR_OWNER)}"
export GHCR_OWNER="${GHCR_OWNER:-ansari-saif}"
SANDBOX_IMAGE="$(env_get SANDBOX_IMAGE)"
SANDBOX_IMAGE="${SANDBOX_IMAGE:-ghcr.io/${GHCR_OWNER}/software-agent-sandbox:${TAG}}"
export SANDBOX_IMAGE

print_rollback() {
  local rc=$?
  [ "$rc" -eq 0 ] && return 0
  echo "" >&2
  echo "==> DEPLOY OF ${TAG} FAILED (exit ${rc})" >&2
  docker compose logs --tail=80 api worker sandbox-controller web traefik 2>/dev/null || true
  echo "" >&2
  echo "Rollback:" >&2
  if [ -f "$STATE_DIR/previous_tag" ]; then
    echo "  bash scripts/rollback.sh            # -> $(cat "$STATE_DIR/previous_tag")" >&2
  else
    echo "  (no previous tag recorded) bash scripts/rollback.sh <known-good-sha>" >&2
  fi
  if [ -n "${PRE_DEPLOY_DUMP:-}" ]; then
    echo "  If the migration changed the schema incompatibly, restore the pre-deploy dump:" >&2
    echo "    $PRE_DEPLOY_DUMP   (see docs/runbook.md#restore-from-backup)" >&2
  fi
  exit "$rc"
}
trap print_rollback EXIT

echo "==> deploying tag ${TAG} (previous: ${PREV_TAG:-none})"

docker network inspect software-agent_sandbox-net >/dev/null 2>&1 \
  || { echo "network software-agent_sandbox-net missing; run scripts/bootstrap-server.sh" >&2; exit 1; }

echo "==> pulling images"
docker compose pull --quiet
# The controller cannot pull images (socket proxy has IMAGES=0), so pre-pull the sandbox image.
docker pull --quiet "$SANDBOX_IMAGE"

echo "==> ensuring postgres is up"
docker compose up -d --no-build --wait postgres

echo "==> pre-migration backup -> ${BACKUP_DIR}/pre-deploy"
PRE_DEPLOY_DUMP="${BACKUP_DIR}/pre-deploy/$(date -u +%Y%m%dT%H%M%SZ)-before-${TAG}.dump"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$PRE_DEPLOY_DUMP"
[ -s "$PRE_DEPLOY_DUMP" ] || { echo "pg_dump produced an empty file" >&2; exit 1; }
chmod 600 "$PRE_DEPLOY_DUMP"
# Keep the last 10 pre-deploy dumps; nightly backups are handled by scripts/backup.sh.
ls -1t "$BACKUP_DIR"/pre-deploy/*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f

echo "==> running database migrations"
docker compose run --rm --no-deps db-migrate

echo "==> starting stack"
# No --wait: db-migrate is a one-shot dependency; smoke-test.sh polls health instead.
docker compose up -d --no-build --remove-orphans

echo "$TAG" > "$STATE_DIR/current_tag"

echo "==> smoke tests"
bash "$ROOT/scripts/smoke-test.sh"

docker compose ps
docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true
echo "==> deploy of ${TAG} complete"
