# Runbook

All commands run on the server as the deploy user from the deploy directory (default `/opt/software-agent`) unless noted. Compose resolves image tags from `IMAGE_TAG`, so export it first for any manual `docker compose` command:

```bash
cd /opt/software-agent
export IMAGE_TAG="$(cat .deploy/current_tag)"
```

## Deploy

The normal path is to merge to `main`. CI runs, then `.github/workflows/deploy.yml` builds and pushes `ghcr.io/<owner>/software-agent-{api,worker,sandbox-controller,web,migrate,sandbox}:<sha>`, copies `docker-compose.yml`, `scripts/` and `deploy/` to the server, and runs `scripts/deploy.sh <sha>`.

For a manual deploy of an already-pushed SHA:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u <user> --password-stdin   # if packages are private
bash scripts/deploy.sh <sha>
```

`deploy.sh` does the following:

1. Records the current tag in `.deploy/previous_tag`.
2. Pulls all images, including the sandbox image, which the controller cannot pull itself.
3. Writes a `pg_dump` to `$BACKUP_DIR/pre-deploy/`.
4. Runs `db-migrate`.
5. Runs `up -d` and then `scripts/smoke-test.sh`.

On failure it prints the rollback command and the path of the pre-deploy dump.

## Rollback

```bash
bash scripts/rollback.sh            # to .deploy/previous_tag
bash scripts/rollback.sh <sha>      # to a specific tag
```

The rollback script does not revert migrations. If the failed release applied a migration the old code can't run against, restore the pre-deploy dump (next section, using the file under `pre-deploy/`) and then roll back.

## Restore from backup

Backups live in `${BACKUP_DIR:-/var/backups/software-agent}`. Database dumps are in `db/*.dump` (nightly) and `pre-deploy/*.dump`. Workspace archives are in `workspaces/*.tar.gz`. Always restore a database dump and a workspace archive from the same night. The `sudo` steps need an admin account, because the deploy user has no sudo.

```bash
export IMAGE_TAG="$(cat .deploy/current_tag)"
DUMP=/var/backups/software-agent/db/software-agent-<ts>.dump
WS=/var/backups/software-agent/workspaces/workspaces-<ts>.tar.gz

docker compose stop web api worker sandbox-controller traefik
docker ps -q --filter label=com.software-agent.sandbox=true | xargs -r docker rm -f

# Database
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$DUMP"

# Workspaces (keep the current tree until the restore is verified)
WSROOT="$(grep -E '^HOST_WORKSPACE_ROOT=' .env | cut -d= -f2-)"
sudo mv "$WSROOT" "$WSROOT.before-restore-$(date +%s)"
sudo install -d -m 750 -o 1000 -g 1000 "$WSROOT"
sudo tar -C "$WSROOT" -xzf "$WS"

docker compose up -d --no-build
bash scripts/smoke-test.sh
```

**Quarterly restore drill.** Restore last night's backup into a scratch Postgres and compare row counts. This proves the backups are usable without touching production:

```bash
docker run -d --name sa-restore-drill -e POSTGRES_PASSWORD=drill public.ecr.aws/docker/library/postgres:16.8-bookworm
sleep 5
docker exec -i sa-restore-drill pg_restore -U postgres -d postgres --no-owner < "$DUMP"
docker exec sa-restore-drill psql -U postgres -c 'select count(*) from "Project";'
docker rm -f sa-restore-drill
mkdir -p /tmp/ws-drill && tar -C /tmp/ws-drill -xzf "$WS" && ls /tmp/ws-drill | head && rm -rf /tmp/ws-drill
```

Record the date and result of each drill in the ops log.

## Rotate secrets

After changing any value in `.env`, recreate the services that use it: `docker compose up -d --no-build --force-recreate <services>`.

| Secret | Used by | How |
|---|---|---|
| `INTERNAL_API_TOKEN` | api, worker, sandbox-controller | Generate it with `openssl rand -hex 32` and update `.env`. Recreate all three services together, because a mismatch causes 401s between them. |
| `POSTGRES_PASSWORD` | postgres, `DATABASE_URL` | Run `docker compose exec postgres psql -U "$POSTGRES_USER" -c "ALTER USER ... PASSWORD '...'"`. Then update both `POSTGRES_PASSWORD` and `DATABASE_URL` in `.env` and recreate api, worker, controller and db-migrate. |
| `ANTHROPIC_API_KEY` | worker | Create a new key in the Anthropic console, update `.env`, recreate the worker, then revoke the old key. |
| Deploy SSH key | GitHub `DEPLOY_SSH_KEY` | Add the new public key to `~deploy/.ssh/authorized_keys`, update the GitHub secret, run one deploy, then remove the old key. |

### Clerk key rotation (SEC-01)

1. In the Clerk dashboard, go to API keys and **roll the secret key**. Copy the new `sk_live_...` value.
2. Update `CLERK_SECRET_KEY` in the server `.env`. If the JWT public key changed, also update `CLERK_JWT_PUBLIC_KEY`. Update `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` if Clerk issued a new publishable key; that one is baked into the web build, so update the GitHub variable and redeploy.
3. Run `docker compose up -d --no-build --force-recreate web api sandbox-controller`.
4. Revoke the old key in Clerk. Confirm that sign-in works and that `scripts/smoke-test.sh` passes.
5. Update local developer `.env` files. Never commit them.

### Purge `apps/backend/jwt-test.ts` from git history

That file contained a live Clerk secret. **Rotation (above) is the fix; the purge only removes the leftover.** Purging rewrites every commit SHA and **requires explicit approval from the repo owner and a force-push to `main`**. Do not do it as part of routine work.

```bash
# Fresh mirror clone, never your working copy
git clone --mirror git@github.com:<owner>/software-agent.git sa-purge.git
cd sa-purge.git
pip install git-filter-repo
git filter-repo --invert-paths --path apps/backend/jwt-test.ts
# Also scan for any remaining secrets:
gitleaks detect --source . --log-opts="--all"
# After owner approval only:
git push --force --mirror origin
```

Afterwards, every collaborator must re-clone, because old clones still contain the secret. Ask GitHub Support to purge cached views and PR refs if needed, and close or recreate any open PRs. CI runs keyed by SHA (and GHCR tags) refer to the old SHAs, so redeploy from the new `main` HEAD.

## Incident response

1. **Contain.**
   - For a suspected compromise of a sandbox or tenant, stop that sandbox (see "Reap stuck sandboxes" below, filtered by the project's label) and disable the user in Clerk.
   - For a suspected compromise of a platform service, stop that service (`docker compose stop api` or similar). nginx then returns 502, which is safer than serving.
   - For runaway spend, set `MAX_CONCURRENT_RUNS=0` (or stop the worker) and revoke the Anthropic key.
2. **Preserve evidence** before changing anything: `docker compose logs --since 24h > incident-<ts>.log`, `docker inspect <container>`, a copy of the affected workspace, and `/var/log/nginx/*`.
3. **Eradicate.** Rotate every secret the affected component could read (see the table above). Redeploy from a known-good SHA. Rebuild the sandbox image if it is suspect.
4. **Recover.** Restore from backup if data was altered, then run the smoke tests.
5. **Follow up.** Write a post-incident note, add a regression check to `scripts/smoke-test.sh` or the tests, and update `docs/threat-model.md`.

## Sandbox capacity issues

Symptoms: "sandbox limit reached" errors, slow IDEs, or a failing memory floor in the smoke test.

```bash
docker ps --filter label=com.software-agent.sandbox=true --format 'table {{.Names}}\t{{.Status}}\t{{.RunningFor}}'
docker stats --no-stream $(docker ps -q --filter label=com.software-agent.sandbox=true)
free -h; df -h "$(grep -E '^HOST_WORKSPACE_ROOT=' .env | cut -d= -f2-)"
```

- Lower `SANDBOX_IDLE_MINUTES` or `SANDBOX_MAX_AGE_MINUTES` to reap sooner. Lower `MAX_CONCURRENT_SANDBOXES` or `SANDBOX_MEMORY_GB` if the host is overcommitted. A rough guide is (host RAM − about 6 GB for services and co-hosted apps) ÷ `SANDBOX_MEMORY_GB`. Recreate the controller after changing any of these.
- For disk pressure, check large workspaces (`du -sh $WSROOT/* | sort -h | tail`), `docker system df`, and old images (`docker image prune --filter until=168h`).
- If sandboxes can't resolve DNS, the host's upstream resolver may be on a private range that the sandbox firewall blocks. Set public resolvers in `/etc/docker/daemon.json` (`"dns": ["1.1.1.1", "9.9.9.9"]`) and restart Docker during a maintenance window.

## Reap stuck sandboxes

The controller normally reaps idle and over-age sandboxes. To clean up by hand, for example after a controller crash:

```bash
# List
docker ps -a --filter label=com.software-agent.sandbox=true

# Remove all sandboxes (users get a fresh one on next open; workspaces are on the host and survive)
docker ps -aq --filter label=com.software-agent.sandbox=true | xargs -r docker rm -f

# Remove sandboxes for one project
docker ps -aq --filter label=com.software-agent.sandbox=true --filter label=com.software-agent.project-id=<projectId> | xargs -r docker rm -f

# Exited/dead only
docker ps -aq --filter label=com.software-agent.sandbox=true --filter status=exited --filter status=dead | xargs -r docker rm
```

Then restart the controller so its in-memory state matches: `docker compose restart sandbox-controller`.

## Firewall check

```bash
sudo iptables -S SANDBOX-EGRESS; sudo iptables -S SANDBOX-HOST
sudo systemctl status software-agent-sandbox-firewall
```

From inside a sandbox, `curl -m 3 http://169.254.169.254/` and `curl -m 3 http://172.30.0.1:22` must time out, and `curl -I https://registry.npmjs.org` must succeed.
