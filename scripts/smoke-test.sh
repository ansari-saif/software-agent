#!/usr/bin/env bash
# Post-deploy smoke tests for software-agent. Exit non-zero on any failure.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

AGENT_URL="${AGENT_URL:-https://agent.ansarisaif.com}"
API_URL="${API_URL:-https://agent-api.ansarisaif.com}"
WORKER_URL="${WORKER_PUBLIC_URL:-https://agent-worker.ansarisaif.com}"
SMOKE_SKIP_PUBLIC="${SMOKE_SKIP_PUBLIC:-0}"
MEM_FLOOR_KB="${MEM_FLOOR_KB:-2097152}" # 2 GiB

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

pass() {
  echo "PASS: $*"
}

wait_curl() {
  local url="$1"
  local label="$2"
  local expect_code="${3:-200}"
  local i
  for i in $(seq 1 30); do
    code="$(curl -s -o /tmp/sa-smoke-body -w '%{http_code}' "$url" || true)"
    if [ "$code" = "$expect_code" ]; then
      pass "$label ($url -> $code)"
      return 0
    fi
    echo "  waiting $label ($i/30) got=$code"
    sleep 2
  done
  fail "$label did not become healthy ($url last=$code)"
}

echo "==> [1] containers running"
for svc in postgres frontend backend worker traefik; do
  state="$(docker compose ps --status running --services | grep -x "$svc" || true)"
  [ -n "$state" ] || fail "service not running: $svc"
done
pass "core services running"

echo "==> [2] local health (loopback)"
wait_curl "http://127.0.0.1:3010/api/health" "frontend health"
wait_curl "http://127.0.0.1:8080/health" "backend health"
wait_curl "http://127.0.0.1:9091/health" "worker health"
# Traefik ping
if curl -sf "http://127.0.0.1:8889/ping" >/dev/null 2>&1 \
  || curl -sf "http://127.0.0.1:8888/ping" >/dev/null 2>&1; then
  pass "traefik ping"
else
  # Traefik may not expose /ping on entrypoint; API port 8889 has /ping when --ping=true
  wait_curl "http://127.0.0.1:8889/ping" "traefik api ping"
fi

echo "==> [3] postgres ready"
docker compose exec -T postgres pg_isready -U "${POSTGRES_USER:-postgres}" \
  || fail "postgres not ready"
pass "postgres ready"

echo "==> [4] public HTTPS"
if [ "$SMOKE_SKIP_PUBLIC" = "1" ]; then
  echo "SKIP: public HTTPS (SMOKE_SKIP_PUBLIC=1)"
else
  wait_curl "$AGENT_URL/api/health" "public frontend"
  wait_curl "$API_URL/health" "public api"
  wait_curl "$WORKER_URL/health" "public worker"
fi

echo "==> [5] auth gate"
if [ "$SMOKE_SKIP_PUBLIC" = "1" ]; then
  code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/projects || true)"
else
  code="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/projects" || true)"
fi
[ "$code" = "401" ] || fail "expected /projects without token -> 401, got $code"
pass "auth gate returns 401"

echo "==> [6] IDE session API shape"
ide_code="$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:8080/ide/session \
  -H 'Content-Type: application/json' -d '{"kind":"backend"}' || true)"
[ "$ide_code" = "401" ] || fail "expected POST /ide/session without token -> 401, got $ide_code"
pass "IDE session requires auth"

# With a bogus empty body but no auth already covered; invalid kind needs auth.
# Documented optional SMOKE_IDE=1 for full container spawn.

if [ "${SMOKE_IDE:-0}" = "1" ]; then
  echo "==> [7] full IDE (SMOKE_IDE=1) — requires SMOKE_JWT"
  [ -n "${SMOKE_JWT:-}" ] || fail "SMOKE_IDE=1 requires SMOKE_JWT"
  create="$(curl -s -w '\n%{http_code}' -X POST http://127.0.0.1:8080/ide/session \
    -H "Authorization: Bearer $SMOKE_JWT" \
    -H 'Content-Type: application/json' \
    -d '{"kind":"backend"}')"
  body="$(echo "$create" | sed '$d')"
  code="$(echo "$create" | tail -n1)"
  [ "$code" = "200" ] || fail "IDE create failed: $code $body"
  session_id="$(echo "$body" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{console.log(JSON.parse(d).sessionId||"")})')"
  [ -n "$session_id" ] || fail "no sessionId in response"
  pass "IDE session created $session_id"
  curl -s -X DELETE "http://127.0.0.1:8080/ide/session" \
    -H "Authorization: Bearer $SMOKE_JWT" \
    -H 'Content-Type: application/json' \
    -d '{"kind":"backend"}' >/dev/null || true
  pass "IDE session stop requested"
else
  echo "SKIP: [7] full IDE (set SMOKE_IDE=1 + SMOKE_JWT to enable)"
fi

echo "==> [8] MediNexPlus regression"
if [ "${SMOKE_SKIP_MEDINEX:-0}" = "1" ]; then
  echo "SKIP: MediNexPlus check (SMOKE_SKIP_MEDINEX=1)"
elif curl -sf http://127.0.0.1:3000/api/health >/dev/null; then
  pass "MediNexPlus still healthy on :3000"
else
  fail "MediNexPlus health check failed on :3000 — software-agent deploy may have impacted it"
fi

echo "==> [9] resource sanity"
free -h || true
docker stats --no-stream || true
avail_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)"
[ -n "$avail_kb" ] || fail "could not read MemAvailable"
if [ "$avail_kb" -lt "$MEM_FLOOR_KB" ]; then
  fail "MemAvailable ${avail_kb}KB below floor ${MEM_FLOOR_KB}KB"
fi
pass "MemAvailable ${avail_kb}KB ok"

echo "==> all smoke checks passed"
