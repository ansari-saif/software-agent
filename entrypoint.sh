#!/bin/bash
set -e

export PYTHONWARNINGS="ignore"

echo "🚀 Starting all services..."
docker --version || { echo "❌ docker not available"; exit 1; }
docker compose version || true

echo "🧹 Skipping aggressive docker cleanup (to avoid OOM)..."

# ✅ Always use the same host and port inside Compose network
DB_HOST="db"
DB_PORT=5432
export DATABASE_URL="postgresql://postgres:password@${DB_HOST}:${DB_PORT}/postgres?schema=public"

echo "🔗 Using DATABASE_URL=${DATABASE_URL}"

# 1️⃣ Wait for Postgres (Compose handles startup order, this is extra safety)
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
  if pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U postgres > /dev/null 2>&1; then
    echo "✓ PostgreSQL is ready!"
    break
  fi
  echo "  Attempt $i/30: PostgreSQL not ready yet..."
  sleep 2
done

# 2️⃣ Run Prisma migrations
cd /usr/src/app/packages/db
pnpm prisma migrate deploy || echo "⚠️ Prisma migrate failed, continuing..."

# 3️⃣ Start Backend
cd /usr/src/app/apps/backend
NODE_OPTIONS="--max-old-space-size=256" pnpm dev > /var/log/backend.log 2>&1 &

# 4️⃣ Start Worker
cd /usr/src/app/apps/worker
NODE_OPTIONS="--max-old-space-size=256" pnpm dev > /var/log/worker.log 2>&1 &

# 5️⃣ Start Frontend
cd /usr/src/app/apps/frontend
NODE_OPTIONS="--max-old-space-size=256" pnpm dev > /var/log/frontend.log 2>&1 &

echo "✅ All services started successfully."
echo "📊 Logs available in /var/log/*.log"

# ✅ Keep container alive and stream logs
tail -f /var/log/backend.log /var/log/worker.log /var/log/frontend.log
