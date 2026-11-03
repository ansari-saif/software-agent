# AGENTS.md

Rules for humans and coding agents working in this repo. Read [README.md](README.md) for the architecture and [docs/threat-model.md](docs/threat-model.md) for why these rules exist.

## Service ownership

| Surface | Owner | Notes |
|---|---|---|
| Browser UI, `/api/health` | `apps/web` | Only browser-facing app. Talks to `api` with the Clerk session token; never to worker/controller. |
| `GET/POST /v1/projects` | `apps/api` | List (cursor paginated) / create project + first message + enqueue run in one transaction. |
| `GET/PATCH/DELETE /v1/projects/:projectId` | `apps/api` | Delete cascades records and asks the controller to destroy the sandbox. |
| `GET/POST /v1/projects/:projectId/messages` | `apps/api` | Posting a message enqueues a pg-boss run. |
| `POST/DELETE /v1/projects/:projectId/sandbox` | `apps/api` -> controller | Ensure or stop the sandbox; returns signed IDE/preview URLs. |
| `GET /v1/projects/:projectId/files`, `/export` | `apps/api` -> controller | Read-only workspace access and tar.gz export. |
| `GET /v1/runs/:runId/events` | `apps/api` | SSE with `Last-Event-ID` replay. |
| `POST /v1/runs/:runId/cancel` | `apps/api` | |
| `/health`, `/ready` | each service | `/ready` checks dependencies (DB, controller). |
| Run execution (agent loop, model calls) | `apps/worker` | pg-boss consumer. No public port; `/health` on 9091 is internal. |
| `/internal/*` (sandboxes, files, exec, processes) | `apps/sandbox-controller` | Requires `INTERNAL_API_TOKEN`. Callers: api, worker. |
| `GET /auth/forward` | `apps/sandbox-controller` | Traefik forwardAuth for `{projectId}.{SANDBOX_BASE_DOMAIN}`. |
| Docker API | `apps/sandbox-controller` only | Via `docker-socket-proxy` (`DOCKER_PROXY_URL`). No other service mounts or reaches the Docker socket. |
| Schemas and wire types | `packages/contracts` | Request/response bodies, run events, and controller payloads. Add a schema here first, then use it on both sides. |

## Non-negotiable security rules

1. **Every `/v1` route uses auth plus `requireProjectOwner`.** Verify the Clerk JWT (pinned algorithm, issuer, `azp` in `CLERK_AUTHORIZED_PARTIES`) and then check that the caller owns the project or run. "Authenticated" is not the same as "authorised". A new route without both is a bug, and `scripts/smoke-test.sh` asserts the 401 behaviour.
2. **Model output is untrusted input.** It can only cause effects through the tools defined in `packages/agent-core`. Each tool has a zod schema, its arguments are validated before execution, and it executes inside the project's sandbox through the controller. Do not parse free-form model text (XML, JSON blobs or markdown) into actions.
3. **Never execute commands or user/model code inside the api, worker or controller containers.** No `child_process` running model-provided strings, no `npm install` of generated `package.json` files, and no eval. Anything executable runs in the sandbox via controller `/internal/exec` or `/internal/processes/*`.
4. **Only the sandbox-controller touches Docker, and only through the socket proxy.** Do not mount `/var/run/docker.sock` anywhere else. Do not widen the proxy permissions (`IMAGES`, `NETWORKS`, `VOLUMES` stay `0`) without an ADR.
5. **Workspace paths go through the controller's path-safety helpers.** Never `path.join` user- or model-supplied paths yourself.
6. **Internal services stay internal.** The worker, controller, socket proxy and Postgres publish no host ports. Do not add public hostnames for them.
7. **Secrets come from env only.** Never commit `.env*`, keys, tokens or test JWTs. CI runs gitleaks.

## Product rules

- **Don't reintroduce fixed templates or prompts.** The old DB, backend and frontend "agents" with hard-coded stacks, DBML and OpenAPI pipelines and per-module prompt files were removed on purpose. The agent is generic: one system prompt in `packages/agent-core` plus tools. Project-specific guidance belongs in the per-project instructions stored in the DB, not in new hard-coded prompt files.
- Keep the agent provider-agnostic behind the `packages/agent-core` provider interface. Use the fake provider in tests.

## Testing

```bash
pnpm install
pnpm --filter db generate
pnpm check-types
pnpm lint
pnpm test                         # all packages/apps (vitest)
pnpm --filter @repo/agent-core test
pnpm --filter api test
pnpm build
bash scripts/smoke-test.sh        # against a running compose stack (SMOKE_SKIP_PUBLIC=1 locally)
```

Tests must not call real model APIs or need a Docker daemon. Use the fake provider and stub the controller client.

## Repo conventions

- pnpm 9 + turbo. Every TS package builds with `tsc` to `dist/`. Do not use `ts-node` in production.
- Database changes go in a Prisma migration (`pnpm --filter db migrate`). Never edit an applied migration.
- Infra changes (`Dockerfile`, `docker-compose.yml`, `deploy/`, `scripts/`) must keep `docker compose config` valid and `scripts/smoke-test.sh` passing.
- Record significant design changes as a new ADR in `docs/adr/`.
