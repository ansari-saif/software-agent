# Deployment notes for software-agent on the MediNexPlus VPS

## Domains
- https://agent.ansarisaif.com — frontend
- https://agent-api.ansarisaif.com — backend API
- https://agent-worker.ansarisaif.com — worker
- https://{session}.ide.ansarisaif.com — per-user code-server (Traefik)

## First bootstrap (on server)
```bash
git clone <repo> /root/software-agent
cd /root/software-agent
cp .env.example .env   # fill secrets
bash scripts/bootstrap-server.sh
SMOKE_SKIP_PUBLIC=1 bash scripts/deploy.sh
# after DNS + certbot:
bash scripts/deploy.sh
```

## CI
Push to `main` runs `.github/workflows/deploy.yml` (needs `DEPLOY_SSH_HOST` + `DEPLOY_SSH_KEY`).

## Caps
`MAX_CONCURRENT_IDE=3` (2–3 recommended on this 30GB host). No Kubernetes on this VPS.
