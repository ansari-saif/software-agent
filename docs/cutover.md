# Cutover from the old stack

The old stack consisted of `frontend`, `backend` and `worker` containers, IDE code-server containers, `agent-worker.ansarisaif.com` and `*.ide.ansarisaif.com`. The new stack is described in the [README](../README.md). The new Prisma schema starts from a single fresh `init` migration, so **the old database is archived rather than migrated**.

Expect roughly 30 to 60 minutes of downtime. Announce it in advance.

## 0. Prerequisites

- [ ] Clerk secret key rotated (runbook, "Clerk key rotation"). Do this first; it doesn't depend on the cutover.
- [ ] Server root and hosting-panel passwords rotated (SEC-13).
- [ ] DNS for `*.sandbox.ansarisaif.com` created and its wildcard certificate issued (DNS-01).
- [ ] `scripts/bootstrap-server.sh` run: deploy user, SSH hardening, `software-agent_sandbox-net`, firewall, backup cron.
- [ ] `/opt/software-agent/.env` filled from the new `.env.example`. `DBDIAGRAM_API_TOKEN`, `IDE_*` and `WORKER_URL` are gone.
- [ ] GitHub secrets `DEPLOY_HOST`, `DEPLOY_USER` and `DEPLOY_SSH_KEY` set, plus variables for `NEXT_PUBLIC_*`. The images for the target SHA are pushed to GHCR.

## 1. Archive the old database

```bash
cd /root/software-agent            # old checkout
ts=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /var/backups/software-agent/legacy
docker compose exec -T postgres pg_dump -U postgres -d software_agent -Fc \
  > /var/backups/software-agent/legacy/old-stack-$ts.dump
ls -lh /var/backups/software-agent/legacy/
# Verify the dump is readable
docker run --rm -i public.ecr.aws/docker/library/postgres:15 pg_restore --list \
  < /var/backups/software-agent/legacy/old-stack-$ts.dump | head
```

Also copy the dump off the host (rclone/scp). The old volume `software-agent_postgres_data` is left untouched. The new stack uses `software-agent_postgres_data_v2`.

## 2. Stop the old stack and remove old IDE containers

```bash
cd /root/software-agent
docker compose down                 # stops frontend/backend/worker/traefik/postgres; keeps volumes
docker ps -aq --filter label=com.software-agent.ide=true | xargs -r docker rm -f
docker compose -f apps/code-server/docker-compose.yml down 2>/dev/null || true
docker network rm software-agent_software-agent 2>/dev/null || true
```

Confirm nothing old is left running: `docker ps --format '{{.Names}}' | grep software-agent`.

## 3. Deploy the new stack

Trigger the deploy workflow manually with `skip_public=1`, or run it on the server as the deploy user:

```bash
cd /opt/software-agent
SMOKE_SKIP_PUBLIC=1 bash scripts/deploy.sh <sha>
```

This runs `db-migrate` against the fresh database and starts all services.

## 4. Switch nginx

```bash
sudo cp /etc/nginx/sites-available/software-agent.conf{,.bak}
sudo cp /opt/software-agent/deploy/nginx-software-agent.conf /etc/nginx/sites-available/software-agent.conf
sudo ln -sfn /etc/nginx/sites-available/software-agent.conf /etc/nginx/sites-enabled/software-agent.conf
sudo nginx -t && sudo systemctl reload nginx
bash scripts/smoke-test.sh          # full run, including public checks
```

## 5. Remove old DNS records

- Delete `agent-worker.ansarisaif.com`.
- Delete `*.ide.ansarisaif.com`.
- Revoke or let expire their certificates (`certbot delete --cert-name ...`).

Re-run `scripts/smoke-test.sh` after DNS TTLs expire. The smoke test fails if `agent-worker` still serves a 200 and warns while it still resolves.

## 6. Clean up (after one stable week)

- Remove the old checkout `/root/software-agent`, after copying anything needed.
- `docker volume rm software-agent_postgres_data` (the legacy dump is the archive).
- `docker image rm software-agent-backend software-agent-frontend software-agent-worker software-agent-code-server-backend software-agent-code-server-frontend`.

## 7. Purge the leaked secret from git history (owner approval required)

Only after the Clerk key is rotated **and the repo owner explicitly approves a force-push to `main`**. Follow the runbook section "Purge `apps/backend/jwt-test.ts` from git history". Do not do this as part of the cutover window unless it has been approved and scheduled. Coordinate a re-clone with every collaborator.

## Rollback during cutover

If the new stack fails before DNS changes:

```bash
cd /opt/software-agent && docker compose down
cd /root/software-agent && git checkout 61b4fc3 && docker compose up -d   # old stack, old volume
```

Then restore the old nginx site from the `.bak` copy made in step 4 and reload nginx.
