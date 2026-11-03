# ADR 0002: A dedicated sandbox-controller behind a Docker socket proxy

- Status: Accepted
- Date: 2026-11-03

## Context

In the old stack the public backend mounted `/var/run/docker.sock` read-write and created IDE containers directly. The worker ran `npm install` and generated scripts inside its own container. Combined with unauthenticated routes, a prompt could chain into root on the host (SEC-03). IDE containers also shared a network with Postgres and the internal services (SEC-06), and every tenant shared one IDE password (SEC-07).

## Decision

1. **One service owns Docker: `apps/sandbox-controller`.** It has no public port. `api` and `worker` call it over `core-net` with `INTERNAL_API_TOKEN`, using payloads defined in `packages/contracts`.
2. **The controller never sees the raw socket.** It talks to `tecnativa/docker-socket-proxy` at `DOCKER_PROXY_URL` over an `internal` network (`proxy-net`). The proxy allows only `CONTAINERS`, `EXEC`, `POST` (plus start/stop). `IMAGES`, `NETWORKS`, `VOLUMES`, `BUILD`, `SYSTEM` and the rest are `0`. The proxy is the only container that mounts the socket, and it mounts it read-only. Traefik gets a second, GET-only proxy instance for label discovery, so the internet-facing router can't create or exec containers.
3. **Sandboxes are per project.** Each one is created from `SANDBOX_IMAGE` with memory, CPU and pids limits, `no-new-privileges` and dropped capabilities, and with only that project's workspace directory bind-mounted (`HOST_WORKSPACE_ROOT/<projectId>`). They are reaped after `SANDBOX_IDLE_MINUTES` of idleness or `SANDBOX_MAX_AGE_MINUTES` total. `MAX_CONCURRENT_SANDBOXES` caps the count. Every sandbox is labelled `com.software-agent.sandbox=true`.
4. **Network isolation.** Sandboxes join only `software-agent_sandbox-net` (172.30.0.0/16). The controller is deliberately not on it. Host firewall rules (DOCKER-USER, installed by `scripts/bootstrap-server.sh`) drop traffic from that subnet to RFC1918 ranges, link-local and the metadata IP 169.254.169.254, and to the host itself. Only Traefik's fixed address may reach sandboxes. Internet egress is allowed so package installs work.
5. **Per-user access at the edge.** Traefik routes `Host({projectId}.{SANDBOX_BASE_DOMAIN})` and applies the `sandbox-auth@docker` forwardAuth middleware. That middleware calls the controller's `GET /auth/forward`, which reads `X-Forwarded-Host`, `X-Forwarded-Uri` and `Cookie`, verifies a signed, project-scoped session, and can return `Set-Cookie`. code-server itself runs without a password.

## Consequences

- If the api or worker is compromised, the attacker gets "ask the controller to do validated things to sandboxes", not Docker.
- A compromised controller can still create containers through the proxy. Docker's API can't be narrowed further at the proxy level (for example, it can't forbid `Privileged: true` in a create body). The controller must therefore build container specs itself from fixed templates and never pass caller-supplied options through. This is the largest residual risk. See the threat model.
- The controller cannot pull images (`IMAGES=0`), so `scripts/deploy.sh` pre-pulls `SANDBOX_IMAGE` on the host.
- Sandboxes use the default `runc` runtime and share the host kernel.

## Later

- **gVisor (`runsc`)** as the sandbox runtime, to move the kernel attack surface out of the host kernel. This needs a runtime option in the controller's container spec plus host setup. It is tracked in the backlog (`todo.md`).
- A separate registrable domain for sandboxes (for example `*.agentsandbox.app`) so user code can't share cookies or a "site" with the app (SEC-12).
