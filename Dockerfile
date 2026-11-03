# syntax=docker/dockerfile:1.7
# Multi-stage build for every Node service in the monorepo.
# Targets: api, worker, sandbox-controller, web, migrate.
#   docker build --target api -t software-agent-api .
# The sandbox (code-server) image is built separately from apps/sandbox-image.

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20.18.3-bookworm-slim

# ---------------------------------------------------------------------------
# base: toolchain for installing and building (never shipped)
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ---------------------------------------------------------------------------
# deps: resolve the lockfile into the pnpm store (cached on lockfile changes only)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
  && pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline

# ---------------------------------------------------------------------------
# build: compile backend services + packages to dist/ and stage prod bundles
# ---------------------------------------------------------------------------
FROM deps AS build
RUN pnpm --filter db generate \
  && pnpm exec turbo run build \
       --filter=api... \
       --filter=worker... \
       --filter=sandbox-controller... \
       --filter=db

# pnpm deploy copies each app with an isolated, prod-only node_modules. It applies
# package-level .gitignore files, which drop dist/, so build output is copied in
# explicitly for the app and for every injected workspace package. The generated Prisma
# client lives outside @prisma/client and is copied into every bundle that uses it.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    set -eu; \
    for pkg in api worker sandbox-controller; do \
      pnpm --filter "$pkg" deploy --prod "/out/$pkg"; \
      rm -rf "/out/$pkg/dist" "/out/$pkg/src" "/out/$pkg/.turbo"; \
      cp -R "/app/apps/$pkg/dist" "/out/$pkg/dist"; \
      test -f "/out/$pkg/dist/index.js"; \
    done; \
    pnpm --filter db deploy "/out/db"; \
    for injected in /out/*/node_modules/.pnpm/*@file+packages+*; do \
      dir="$(echo "$injected" | sed -E 's#.*@file\+packages\+([^_/]+).*#\1#')"; \
      name="$(node -p "require('/app/packages/$dir/package.json').name")"; \
      if [ -d "/app/packages/$dir/dist" ]; then \
        rm -rf "$injected/node_modules/$name/dist"; \
        cp -R "/app/packages/$dir/dist" "$injected/node_modules/$name/dist"; \
      fi; \
    done; \
    prisma_src="$(ls -d /app/node_modules/.pnpm/@prisma+client@*/node_modules/.prisma | head -n1)"; \
    for dest in /out/*/node_modules/.pnpm/@prisma+client@*/node_modules; do \
      rm -rf "$dest/.prisma"; cp -R "$prisma_src" "$dest/.prisma"; \
    done

# ---------------------------------------------------------------------------
# web-build: Next.js standalone build (separate so NEXT_PUBLIC_* args don't bust
# the backend build cache)
# ---------------------------------------------------------------------------
FROM build AS web-build
ARG NEXT_PUBLIC_API_URL=https://agent-api.ansarisaif.com
ARG NEXT_PUBLIC_SANDBOX_BASE_DOMAIN=sandbox.ansarisaif.com
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_SANDBOX_BASE_DOMAIN=$NEXT_PUBLIC_SANDBOX_BASE_DOMAIN \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
RUN mkdir -p apps/web/public \
  && pnpm exec turbo run build --filter=@repo/web...
RUN test -f apps/web/.next/standalone/apps/web/server.js \
  || (echo "apps/web must set output: 'standalone' in next.config.ts" >&2; exit 1)

# ---------------------------------------------------------------------------
# runtime: minimal shared base for shipped images
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------------------
# Per-app runtime images. Files stay root-owned so the node user cannot modify code.
# ---------------------------------------------------------------------------
FROM runtime AS api
COPY --from=build /out/api /app
ENV PORT=8080
EXPOSE 8080
USER node
CMD ["node", "dist/index.js"]

FROM runtime AS worker
COPY --from=build /out/worker /app
ENV PORT=9091
EXPOSE 9091
USER node
CMD ["node", "dist/index.js"]

FROM runtime AS sandbox-controller
# tar streams workspace archives in and out of sandbox containers.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tar \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /out/sandbox-controller /app
ENV PORT=7070
EXPOSE 7070
USER node
CMD ["node", "dist/index.js"]

FROM runtime AS migrate
COPY --from=build /out/db /app
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

FROM runtime AS web
COPY --from=web-build /app/apps/web/.next/standalone /app
COPY --from=web-build /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=web-build /app/apps/web/public /app/apps/web/public
ENV PORT=3000 \
    HOSTNAME=0.0.0.0
EXPOSE 3000
USER node
WORKDIR /app/apps/web
CMD ["node", "server.js"]
