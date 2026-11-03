#!/usr/bin/env bash
# Nightly backup: Postgres (pg_dump custom format) + project workspaces (tar.gz).
# Installed as a cron job by scripts/bootstrap-server.sh.
#
# Env:
#   BACKUP_DIR       default /var/backups/software-agent
#   RETENTION_DAYS   default 14
#   RCLONE_REMOTE    optional, e.g. "b2:software-agent-backups" -> copies backups off-site
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

BACKUP_DIR="${BACKUP_DIR:-/var/backups/software-agent}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
RCLONE_REMOTE="${RCLONE_REMOTE:-$(env_get RCLONE_REMOTE)}"
HOST_WORKSPACE_ROOT="${HOST_WORKSPACE_ROOT:-$(env_get HOST_WORKSPACE_ROOT)}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
IMAGE_TAG="$(cat "$ROOT/.deploy/current_tag" 2>/dev/null || echo latest)"
export IMAGE_TAG

umask 077
mkdir -p "$BACKUP_DIR/db" "$BACKUP_DIR/workspaces"

echo "[$TS] pg_dump"
db_file="$BACKUP_DIR/db/software-agent-$TS.dump"
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$db_file.partial"
[ -s "$db_file.partial" ] || { echo "pg_dump produced an empty file" >&2; rm -f "$db_file.partial"; exit 1; }
mv "$db_file.partial" "$db_file"

if [ -n "$HOST_WORKSPACE_ROOT" ] && [ -d "$HOST_WORKSPACE_ROOT" ]; then
  echo "[$TS] workspaces tar ($HOST_WORKSPACE_ROOT)"
  ws_file="$BACKUP_DIR/workspaces/workspaces-$TS.tar.gz"
  # node_modules and build output are reproducible; .git snapshots are kept.
  tar -C "$HOST_WORKSPACE_ROOT" \
      --exclude='*/node_modules' --exclude='*/.next' --exclude='*/dist' --exclude='*/.venv' \
      -czf "$ws_file.partial" .
  mv "$ws_file.partial" "$ws_file"
else
  echo "WARN: HOST_WORKSPACE_ROOT not set or missing; skipping workspace backup" >&2
fi

echo "[$TS] pruning backups older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR/db" "$BACKUP_DIR/workspaces" -type f -mtime +"$RETENTION_DAYS" -delete

if [ -n "$RCLONE_REMOTE" ]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "[$TS] rclone -> $RCLONE_REMOTE"
    rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include "db/**" --include "workspaces/**" --max-age 48h
  else
    echo "ERROR: RCLONE_REMOTE set but rclone is not installed" >&2
    exit 1
  fi
fi

echo "[$TS] backup complete"
