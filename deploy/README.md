# Deployment

Single-host Docker Compose deployment behind the host's nginx. The full procedures are in [docs/runbook.md](../docs/runbook.md), and the one-time migration from the old stack is in [docs/cutover.md](../docs/cutover.md).

## Public hostnames

| Host | Upstream |
|---|---|
| `https://agent.ansarisaif.com` | web (`127.0.0.1:3010`) |
| `https://agent-api.ansarisaif.com` | api (`127.0.0.1:8080`), SSE at `/v1/runs/:id/events` |
| `https://{projectId}.sandbox.ansarisaif.com` | Traefik (`127.0.0.1:8888`) with forwardAuth, routing to the project's sandbox |

The worker, sandbox-controller, socket proxies and Postgres have no public hostname and no host port. Production should move sandboxes to a separate registrable domain (for example `*.agentsandbox.app`). See the note in `nginx-software-agent.conf`.

## First-time server setup (as root)

```bash
git clone <repo> /tmp/software-agent && cd /tmp/software-agent
DEPLOY_SSH_PUBKEY="ssh-ed25519 AAAA... github-deploy" bash scripts/bootstrap-server.sh
# Fill /opt/software-agent/.env (from .env.example), issue TLS certs as printed, then re-run
# bootstrap so it installs the nginx site.
```

Bootstrap creates the `deploy` user (key-only, docker group), disables password and root SSH login, creates `software-agent_sandbox-net` (172.30.0.0/16) with egress firewall rules, and installs the nightly backup cron.

## CI/CD

`.github/workflows/deploy.yml` runs after CI passes on `main`. It builds the images, pushes them to GHCR tagged with the commit SHA, copies `docker-compose.yml`, `scripts/` and `deploy/` to `DEPLOY_PATH`, and runs `scripts/deploy.sh <sha>` as `DEPLOY_USER`.

Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, and optionally `DEPLOY_SSH_FINGERPRINT`.
Variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SANDBOX_BASE_DOMAIN`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, and optionally `DEPLOY_PATH` (default `/opt/software-agent`).

## Scripts

| Script | Purpose |
|---|---|
| `scripts/deploy.sh <tag>` | Pull, back up, migrate, start, smoke test |
| `scripts/rollback.sh [tag]` | Return to `.deploy/previous_tag` |
| `scripts/backup.sh` | Nightly `pg_dump` and workspace tarball, 14-day retention, optional `RCLONE_REMOTE` |
| `scripts/smoke-test.sh` | Health checks plus the security regression (unauthenticated `/v1` returns 401, internal services not published, `agent-worker` gone) |
| `scripts/bootstrap-server.sh` | One-time host setup |

## Capacity

The host has 30 GB of RAM and is shared with MediNexPlus. Keep `MAX_CONCURRENT_SANDBOXES` at 2–3 with `SANDBOX_MEMORY_GB=4`. Kubernetes is not used.
