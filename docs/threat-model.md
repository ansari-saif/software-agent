# Threat model

Scope: the production stack in `docker-compose.yml` behind nginx on a single host. The audit IDs SEC-01 to SEC-14 refer to the November 2026 security review of the previous stack. Each row below records how the new architecture addresses one of those findings.

## Assets

| Asset | Why it matters |
|---|---|
| Host root / Docker daemon | Full control of every tenant, every secret, and any co-hosted service (MediNexPlus). |
| Secrets | `CLERK_SECRET_KEY`, `ANTHROPIC_API_KEY`, `INTERNAL_API_TOKEN`, `POSTGRES_PASSWORD`, deploy SSH key. |
| Tenant data | Project workspaces (source code), prompts and messages, run history. |
| Model spend | The Anthropic API key and per-user quota. Abuse costs money directly. |
| Availability | Shared host capacity (RAM/CPU) for sandboxes and services. |
| Brand domain | Cookies and trust on `ansarisaif.com`. |

## Actors

| Actor | Capabilities |
|---|---|
| Anonymous internet user | Can reach nginx: web, api, and sandbox hostnames. |
| Authenticated user | Has a valid Clerk session and can create projects, run the agent, and open their own sandbox. |
| Malicious prompt / poisoned content | Controls model output. It can come from the user or from fetched or installed content (indirect prompt injection). |
| Code running in a sandbox | Arbitrary code as the sandbox user, with internet egress. This is expected behaviour, not a compromise. |
| Compromised dependency | Code that runs in a platform service at build time or runtime. |
| Operator | Has SSH access as the deploy user (docker group) and controls the GitHub repo/CI. |

## Trust boundaries

1. **Internet to nginx.** TLS, rate limits (10 r/s per IP for the api, 30 r/s for sandboxes), body size limit of 6 MB, security headers.
2. **nginx to web/api.** Every `/v1` request is authenticated (Clerk JWT) and authorised (`requireProjectOwner`).
3. **nginx to Traefik to sandbox.** Every request passes forwardAuth (`/auth/forward` on the controller) with a project-scoped session.
4. **Model output to side effects.** The only path is zod-validated tool calls, executed by the controller inside the project's sandbox.
5. **api/worker to controller.** `INTERNAL_API_TOKEN` over `core-net`. Payloads are validated by `packages/contracts` schemas.
6. **Controller to Docker.** Only via `docker-socket-proxy`, with a restricted API surface, over an internal network.
7. **Sandbox to everything else.** Only `sandbox-net`, with a host firewall blocking private ranges, the host and the metadata endpoint. Internet is allowed.
8. **CI to server.** GHCR images pinned by SHA, SSH as a non-root user, key-only.

## STRIDE

| # | Threat (STRIDE) | Example | Mitigation | Audit IDs |
|---|---|---|---|---|
| 1 | **S**poofing | Forged or replayed JWT, or a token minted for another app | `@repo/auth` verifies with `CLERK_JWT_PUBLIC_KEY`, pins the algorithm, and checks `iss`, `exp`/`nbf` and that `azp` is in `CLERK_AUTHORIZED_PARTIES` | SEC-10 |
| 2 | **S**poofing | Leaked Clerk secret used to mint sessions or call the Clerk backend API | Key rotated, purged from history (runbook), gitleaks in CI, secrets only in the server `.env` (mode 600) | SEC-01 |
| 3 | **S**poofing | Calling the worker or controller directly | No public hostname or host port. `/internal/*` requires `INTERNAL_API_TOKEN` (at least 16 characters). `agent-worker.*` removed, and the smoke test asserts it is gone | SEC-04 |
| 4 | **S**poofing | Opening someone else's sandbox URL | forwardAuth checks a signed, project-scoped session cookie against project ownership. There is no shared IDE password | SEC-07 |
| 5 | **T**ampering | `../` paths from the model write outside the workspace | Tool arguments are zod-validated. The controller's `pathSafety` resolves paths and refuses anything outside `WORKSPACE_ROOT/<projectId>`, including through symlinks | SEC-02 |
| 6 | **T**ampering | Model-generated code injected into platform source or templates | No templates. Generated code lives only in the workspace and runs only in the sandbox. The schema is never parsed into code by platform services | SEC-09 |
| 7 | **T**ampering / **E**levation | A prompt makes a platform service run `npm install` or scripts, then reaches the Docker socket and root on the host | Platform containers never run model output. Only the controller reaches Docker, through the proxy. Services run as `node` with a read-only rootfs, `no-new-privileges` and `cap_drop: ALL` | SEC-03, SEC-11 |
| 8 | **T**ampering | Malicious or typosquatted dependency | Removed `dockernode`, `tar-fs` and other unused packages. Frozen lockfile. `pnpm audit` in CI. Renovate. Pinned base images | SEC-14 |
| 9 | **R**epudiation | "I didn't start that run", or no trace of who did what | Runs, messages and events are stored with `userId`. Structured logs carry request IDs (`@repo/observability`). Each run leaves a git commit in the workspace | – |
| 10 | **I**nformation disclosure | User A reads or writes user B's project, prompts or runs (IDOR) | Every `/v1` route uses `requireProjectOwner` (also for runs, via the project). Cross-tenant access returns 404 | SEC-05 |
| 11 | **I**nformation disclosure | A sandbox reaches Postgres, internal services, other sandboxes, or cloud metadata | The sandbox network has no platform services. The DOCKER-USER and INPUT rules drop traffic from 172.30.0.0/16 to RFC1918, link-local and 169.254.169.254, and to the host | SEC-06 |
| 12 | **I**nformation disclosure | A preview app sets cookies on or phishes from the app's parent domain | Sandboxes are on their own subdomain. The plan is to move them to a separate registrable domain. Sandbox-specific cookies are host-only. Responses from `api` use `X-Frame-Options: DENY` | SEC-12 |
| 13 | **I**nformation disclosure | Plain-text root/panel credentials in a local `.env` | Rotated. Root SSH and password auth disabled. The deploy user is key-only | SEC-13 |
| 14 | **D**enial of service / cost | Floods of generation or long, unbounded runs drain money and capacity | nginx `limit_req`, api `RATE_LIMIT_PER_MINUTE`, `DAILY_TOKEN_QUOTA`, `MAX_CONCURRENT_RUNS`, per-step and per-run token caps, `AGENT_MAX_STEPS` | SEC-08 |
| 15 | **D**enial of service | Sandboxes exhaust host RAM, PIDs or disk | `MAX_CONCURRENT_SANDBOXES`, plus memory, CPU and pids limits per sandbox, plus idle and max-age reaping. Service `mem_limit`/`pids_limit`. The smoke test checks that available memory stays above a floor | SEC-08 |
| 16 | **E**levation | Compromised controller abuses the proxy to create a privileged container | The proxy blocks image, network and volume APIs. The controller builds specs from fixed code and never forwards caller options. See residual risks | SEC-03 |
| 17 | **E**levation | Container escape from a sandbox | Capabilities dropped, `no-new-privileges`, non-root user, resource limits. gVisor is planned | SEC-11 |

## Residual risks

- **The Docker socket proxy is coarse.** With `CONTAINERS=1` and `POST=1`, a compromised controller could create a privileged container with host mounts. The controller is small, has no public port, and builds container specs only from code. Moving to rootless Docker or gVisor would shrink this risk.
- **Shared kernel.** Sandboxes run on `runc`, so a kernel exploit from user code reaches the host. gVisor is in the backlog.
- **The sandbox domain shares a registrable domain** (`*.sandbox.ansarisaif.com`) until it moves to a separate one such as `agentsandbox.app`.
- **Internet egress from sandboxes** is allowed, which makes them usable for abuse (scanning, spam) or for exfiltrating the user's own code. Mitigations are rate limits, max-age reaping, account bans and egress monitoring. An egress proxy or allowlist can come later.
- **Indirect prompt injection** can still steer the agent within the user's own project, for example by deleting files or adding malicious dependencies to their app. Git snapshots per run allow recovery. Platform services are unaffected.
- **The deploy user is in the docker group**, which is root-equivalent. Treat the deploy SSH key as a root credential and keep it only in GitHub secrets.
- **Single host:** backups are local unless `RCLONE_REMOTE` is set. Off-site backups should be configured.
- **The secret history purge** of `apps/backend/jwt-test.ts` needs owner approval and a force-push. Until it is done, the rotated key remains in history. Rotation is the real mitigation.
