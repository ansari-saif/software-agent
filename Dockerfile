FROM public.ecr.aws/docker/library/node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && npm install -g pnpm@9.0.0 --force --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter db generate

FROM deps AS migrate
WORKDIR /app/packages/db
CMD ["pnpm", "run", "migrate:deploy"]

FROM deps AS backend
ENV PORT=8080
WORKDIR /app/apps/backend
CMD ["pnpm", "run", "start"]

FROM deps AS worker
ENV PORT=9091
WORKDIR /app/apps/worker
CMD ["pnpm", "run", "start"]

FROM deps AS frontend-build
ARG NEXT_PUBLIC_BACKEND_URL=https://agent-api.ansarisaif.com
ARG NEXT_PUBLIC_WORKER_URL=https://agent-worker.ansarisaif.com
ARG NEXT_PUBLIC_IDE_BASE_DOMAIN=ide.ansarisaif.com
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_WORKER_URL=$NEXT_PUBLIC_WORKER_URL
ENV NEXT_PUBLIC_IDE_BASE_DOMAIN=$NEXT_PUBLIC_IDE_BASE_DOMAIN
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/frontend
RUN pnpm run build

# Reuse deps image (pnpm already present) — avoid second apt/corepack pull
FROM deps AS frontend
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
COPY --from=frontend-build /app/apps/frontend/.next /app/apps/frontend/.next
COPY --from=frontend-build /app/apps/frontend/public /app/apps/frontend/public
WORKDIR /app/apps/frontend
EXPOSE 3000
CMD ["pnpm", "run", "start"]
