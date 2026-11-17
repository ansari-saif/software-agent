#!/usr/bin/env bash
# Post-deploy smoke + security regression tests for software-agent. Exits non-zero on failure.
#
# Env:
#   WEB_URL / API_URL     public URLs (defaults: agent / agent-api .ansarisaif.com)
#   SMOKE_SKIP_PUBLIC=1   only test loopback endpoints (before DNS/TLS exist)
#   SMOKE_SKIP_MEDINEX=1  skip the co-hosted MediNexPlus regression check
#   MEM_FLOOR_KB          minimum MemAvailable after deploy (default 2 GiB)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WEB_URL="${WEB_URL:-https://agent.ansarisaif.com}"
API_URL="${API_URL:-https://agent-api.ansarisaif.com}"
OLD_WORKER_HOST="agent-worker.ansarisaif.com"
SMOKE_SKIP_PUBLIC="${SMOKE_SKIP_PUBLIC:-0}"
MEM_FLOOR_KB="${MEM_FLOOR_KB:-2097152}"
IMAGE_TAG="${IMAGE_TAG:-$(cat "$ROOT/.deploy/current_tag" 2>/dev/null || echo latest)}"
export IMAGE_TAG

LOCAL_WEB="${LOCAL_WEB_URL:-http://127.0.0.1:3010}"
LOCAL_API="${LOCAL_API_URL:-http://127.0.0.1:8080}"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

http_code() {
  # http_code <method> <url> [curl args...]
  local method="$1" url="$2"; shift 2
  curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X "$method" "$@" "$url" || true
}

wait_200() {
  local url="$1" label="$2" code="" i
  for i in $(seq 1 45); do
    code="$(http_code GET "$url")"
    if [ "$code" = "200" ]; then
      pass "$label ($url -> 200)"
      return 0
    fi
    echo "  waiting for $label ($i/45) got=$code"
    sleep 2
  done
  fail "$label not healthy ($url last=$code)"
}

container_http_ok() {
  # Probe an internal-only port from inside its own container.
  local svc="$1" url="$2"
  docker compose exec -T "$svc" node -e \
    "fetch('$url').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}

echo "==> [1] services running"
running="$(docker compose ps --status running --services)"
for svc in postgres api worker sandbox-controller docker-socket-proxy traefik-socket-proxy traefik web; do
  grep -qx "$svc" <<<"$running" || fail "service not running: $svc"
done
pass "all services running"

echo "==> [2] health (loopback)"
wait_200 "$LOCAL_WEB/api/health" "web /api/health"
wait_200 "$LOCAL_API/health" "api /health"
wait_200 "$LOCAL_API/ready" "api /ready"
container_http_ok worker http://127.0.0.1:9091/health || fail "worker /health"
pass "worker /health (internal)"
container_http_ok sandbox-controller http://127.0.0.1:7070/health || fail "sandbox-controller /health"
pass "sandbox-controller /health (internal)"
traefik_health="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q traefik)")"
[ "$traefik_health" = "healthy" ] || fail "traefik health=$traefik_health"
pass "traefik healthy"
docker compose exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null \
  || fail "postgres not ready"
pass "postgres ready"

echo "==> [3] internal services are not exposed on the host"
for pair in worker:9091 sandbox-controller:7070 docker-socket-proxy:2375 traefik-socket-proxy:2375 postgres:5432; do
  published="$(docker compose port "${pair%%:*}" "${pair##*:}" 2>/dev/null || true)"
  # Unpublished ports print as "", ":0" or "invalid IP:0" depending on the compose version.
  host_port="${published##*:}"
  if [[ "$host_port" =~ ^[1-9][0-9]*$ ]]; then fail "${pair} is published on the host ($published)"; fi
done
pass "worker/controller/socket proxies/postgres not published"

check_unauth() {
  local base="$1" scope="$2" code
  code="$(http_code GET "$base/v1/projects")"
  [ "$code" = "401" ] || fail "[$scope] GET /v1/projects without auth -> $code (want 401)"
  code="$(http_code POST "$base/v1/projects" -H 'Content-Type: application/json' -d '{"prompt":"smoke"}')"
  [ "$code" = "401" ] || fail "[$scope] POST /v1/projects without auth -> $code (want 401)"
  code="$(http_code GET "$base/v1/runs/x/events" -H 'Accept: text/event-stream')"
  [ "$code" = "401" ] || fail "[$scope] GET /v1/runs/x/events without auth -> $code (want 401)"
  code="$(http_code POST "$base/v1/projects/x/sandbox" -H 'Content-Type: application/json' -d '{}')"
  [ "$code" = "401" ] || fail "[$scope] POST /v1/projects/x/sandbox without auth -> $code (want 401)"
  code="$(http_code GET "$base/v1/projects" -H 'Authorization: Bearer not-a-jwt')"
  [ "$code" = "401" ] || fail "[$scope] GET /v1/projects with garbage token -> $code (want 401)"
  pass "[$scope] /v1 routes reject unauthenticated requests"
}

echo "==> [4] auth regression (loopback)"
check_unauth "$LOCAL_API" "loopback"

echo "==> [5] public HTTPS"
if [ "$SMOKE_SKIP_PUBLIC" = "1" ]; then
  echo "SKIP: public checks (SMOKE_SKIP_PUBLIC=1)"
else
  wait_200 "$WEB_URL/api/health" "public web"
  wait_200 "$API_URL/health" "public api"
  check_unauth "$API_URL" "public"

  hsts="$(curl -sI --max-time 10 "$API_URL/health" | tr -d '\r' | grep -i '^strict-transport-security:' || true)"
  [ -n "$hsts" ] || fail "public api missing Strict-Transport-Security"
  pass "public api sends HSTS"

  code="$(http_code GET "https://$OLD_WORKER_HOST/health")"
  [ "$code" != "200" ] || fail "https://$OLD_WORKER_HOST/health still answers 200; worker must not be public"
  if getent hosts "$OLD_WORKER_HOST" >/dev/null 2>&1; then
    echo "WARN: $OLD_WORKER_HOST still resolves in DNS; delete the record (docs/cutover.md)"
  fi
  pass "$OLD_WORKER_HOST no longer serves the worker"
fi

echo "==> [6] nginx no longer routes the old worker host"
if command -v nginx >/dev/null 2>&1; then
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 \
    --resolve "$OLD_WORKER_HOST:443:127.0.0.1" "https://$OLD_WORKER_HOST/health" || true)"
  [ "$code" != "200" ] || fail "local nginx still proxies $OLD_WORKER_HOST"
  pass "local nginx does not serve $OLD_WORKER_HOST"
else
  echo "SKIP: nginx not installed on this host"
fi

echo "==> [7] MediNexPlus regression"
# Only a live MediNexPlus that stops answering is a regression. An empty port means it is not on this host.
if [ "${SMOKE_SKIP_MEDINEX:-0}" = "1" ]; then
  echo "SKIP: MediNexPlus check (SMOKE_SKIP_MEDINEX=1)"
else
  code="$(http_code GET http://127.0.0.1:3000/api/health)"
  if [ "$code" = "000" ]; then
    echo "SKIP: nothing listening on :3000"
  elif [ "$code" = "200" ]; then
    pass "MediNexPlus still healthy on :3000"
  else
    fail "MediNexPlus health check failed on :3000 (HTTP ${code}); this deploy may have impacted it"
  fi
fi

echo "==> [8] resource sanity"
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}' || true
if [ -r /proc/meminfo ]; then
  avail_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
  [ -n "$avail_kb" ] || fail "could not read MemAvailable"
  [ "$avail_kb" -ge "$MEM_FLOOR_KB" ] || fail "MemAvailable ${avail_kb}KB below floor ${MEM_FLOOR_KB}KB"
  pass "MemAvailable ${avail_kb}KB ok"
fi

echo "==> all smoke checks passed"
