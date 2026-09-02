# First-time server bootstrap for software-agent on the MediNexPlus host.
# Run as root on 103.216.171.20 after cloning the repo to /root/software-agent.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env ]; then
  echo "Create $ROOT/.env from .env.example before bootstrap"
  exit 1
fi

mkdir -p /data/software-agent/workspaces

# nginx site
cp "$ROOT/deploy/nginx-software-agent.conf" /etc/nginx/sites-available/software-agent.conf
ln -sfn /etc/nginx/sites-available/software-agent.conf /etc/nginx/sites-enabled/software-agent.conf
nginx -t
systemctl reload nginx

echo "DNS required:"
echo "  agent.ansarisaif.com -> this server"
echo "  agent-api.ansarisaif.com -> this server"
echo "  agent-worker.ansarisaif.com -> this server"
echo "  *.ide.ansarisaif.com -> this server"
echo ""
echo "Then:"
echo "  certbot --nginx -d agent.ansarisaif.com -d agent-api.ansarisaif.com -d agent-worker.ansarisaif.com"
echo "  # wildcard *.ide.ansarisaif.com needs DNS-01"
echo ""
echo "Deploy:"
echo "  SMOKE_SKIP_PUBLIC=1 bash scripts/deploy.sh   # before certs"
echo "  bash scripts/deploy.sh                       # after certs + DNS"
