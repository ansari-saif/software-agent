#!/usr/bin/env bash
# Roll the stack back to the previously deployed image tag.
#
# Usage: scripts/rollback.sh [tag]     (defaults to .deploy/previous_tag)
#
# Does NOT run or revert migrations. Prisma migrations are forward-only; if the failed
# release changed the schema incompatibly, restore the pre-deploy dump first
# (docs/runbook.md#restore-from-backup).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

env_get() {
  local line
  line="$(grep -E "^$1=" .env 2>/dev/null | tail -n1 || true)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  printf '%s' "$line"
}

STATE_DIR="$ROOT/.deploy"
TAG="${1:-$(cat "$STATE_DIR/previous_tag" 2>/dev/null || true)}"
[ -n "$TAG" ] || { echo "no tag given and $STATE_DIR/previous_tag is empty" >&2; exit 2; }
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "invalid tag: $TAG" >&2; exit 2; }

CURRENT="$(cat "$STATE_DIR/current_tag" 2>/dev/null || true)"
echo "==> rolling back ${CURRENT:-unknown} -> ${TAG}"

export IMAGE_TAG="$TAG"
export GHCR_OWNER="${GHCR_OWNER:-$(env_get GHCR_OWNER)}"
export GHCR_OWNER="${GHCR_OWNER:-ansari-saif}"
SANDBOX_IMAGE="$(env_get SANDBOX_IMAGE)"
SANDBOX_IMAGE="${SANDBOX_IMAGE:-ghcr.io/${GHCR_OWNER}/software-agent-sandbox:${TAG}}"
export SANDBOX_IMAGE

docker pull --quiet "$SANDBOX_IMAGE"
docker compose pull --quiet api worker sandbox-controller web
docker compose up -d --no-build --no-deps --wait api worker sandbox-controller web traefik

echo "$TAG" > "$STATE_DIR/current_tag"
if [ -n "$CURRENT" ] && [ "$CURRENT" != "$TAG" ]; then
  echo "$CURRENT" > "$STATE_DIR/previous_tag"
fi

bash "$ROOT/scripts/smoke-test.sh"
echo "==> rollback to ${TAG} complete"
