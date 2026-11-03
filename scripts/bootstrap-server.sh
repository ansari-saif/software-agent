#!/usr/bin/env bash
# First-time server bootstrap for software-agent (Debian/Ubuntu host with Docker + nginx).
# Run once as root from a copy of the repo:
#
#   DEPLOY_SSH_PUBKEY="ssh-ed25519 AAAA... ci-deploy" bash scripts/bootstrap-server.sh
#
# What it does (idempotent):
#   1. creates the non-root deploy user (docker group) and installs its SSH key
#   2. hardens sshd: key-only auth, no root login
#   3. creates the deploy dir, workspace root and backup dir
#   4. creates the docker network software-agent_sandbox-net (172.30.0.0/16)
#   5. installs DOCKER-USER/INPUT firewall rules isolating sandboxes from private ranges
#      and the cloud metadata endpoint, persisted with iptables-persistent
#   6. installs the nginx site (if TLS certificates already exist)
#   7. installs the nightly backup cron job
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/software-agent}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/software-agent}"
SANDBOX_NET="software-agent_sandbox-net"
SANDBOX_SUBNET="172.30.0.0/16"
SANDBOX_IP_RANGE="172.30.128.0/17"   # dynamic sandbox IPs; 172.30.0.2 is reserved for traefik
SANDBOX_BRIDGE="br-sandbox"
TRAEFIK_IP="172.30.0.2"

env_get() {
  local line
  line="$(grep -E "^$1=" "$DEPLOY_PATH/.env" 2>/dev/null | tail -n1 || true)"
  line="${line#*=}"
  line="${line%\"}"; line="${line#\"}"
  printf '%s' "$line"
}

command -v docker >/dev/null || { echo "docker is not installed" >&2; exit 1; }

echo "==> [1] deploy user: $DEPLOY_USER"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
passwd -l "$DEPLOY_USER" >/dev/null   # no password login, keys only
usermod -aG docker "$DEPLOY_USER"
DEPLOY_HOME="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
AUTH_KEYS="$DEPLOY_HOME/.ssh/authorized_keys"
touch "$AUTH_KEYS"
if [ -n "${DEPLOY_SSH_PUBKEY:-}" ] && ! grep -qF "$DEPLOY_SSH_PUBKEY" "$AUTH_KEYS"; then
  echo "$DEPLOY_SSH_PUBKEY" >> "$AUTH_KEYS"
fi
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

echo "==> [2] sshd hardening"
if ! grep -qE '^(ssh-|ecdsa-|sk-)' "$AUTH_KEYS"; then
  echo "WARN: $AUTH_KEYS has no keys; skipping sshd hardening to avoid a lockout." >&2
  echo "      Re-run with DEPLOY_SSH_PUBKEY=... once a key is available." >&2
else
  echo "      Make sure YOU can log in with a key as a sudo-capable non-root user (or have"
  echo "      console access) before this session ends: root SSH login is being disabled."
  cat > /etc/ssh/sshd_config.d/10-software-agent-hardening.conf <<'EOF'
# Managed by software-agent scripts/bootstrap-server.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
EOF
  grep -qE '^\s*Include\s+/etc/ssh/sshd_config.d/\*\.conf' /etc/ssh/sshd_config \
    || sed -i '1i Include /etc/ssh/sshd_config.d/*.conf' /etc/ssh/sshd_config
  sshd -t
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
fi

echo "==> [3] directories"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_PATH" "$DEPLOY_PATH/.deploy"
if [ "$SRC" != "$DEPLOY_PATH" ]; then
  cp -R "$SRC/docker-compose.yml" "$SRC/scripts" "$SRC/deploy" "$DEPLOY_PATH/"
  [ -f "$DEPLOY_PATH/.env" ] || cp "$SRC/.env.example" "$DEPLOY_PATH/.env"
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH"
fi
chmod 600 "$DEPLOY_PATH/.env" 2>/dev/null || true
HOST_WORKSPACE_ROOT="$(env_get HOST_WORKSPACE_ROOT)"
HOST_WORKSPACE_ROOT="${HOST_WORKSPACE_ROOT:-/data/software-agent/workspaces}"
# uid/gid 1000 = `node` in the controller image and the sandbox user (PUID=1000).
install -d -m 750 -o 1000 -g 1000 "$HOST_WORKSPACE_ROOT"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BACKUP_DIR"
install -d -m 755 /var/www/letsencrypt

echo "==> [4] docker network $SANDBOX_NET"
if docker network inspect "$SANDBOX_NET" >/dev/null 2>&1; then
  existing="$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' "$SANDBOX_NET")"
  [ "$existing" = "$SANDBOX_SUBNET" ] \
    || { echo "$SANDBOX_NET exists with subnet $existing (want $SANDBOX_SUBNET); remove it first" >&2; exit 1; }
else
  docker network create \
    --driver bridge \
    --subnet "$SANDBOX_SUBNET" \
    --ip-range "$SANDBOX_IP_RANGE" \
    -o "com.docker.network.bridge.name=$SANDBOX_BRIDGE" \
    -o "com.docker.network.bridge.enable_icc=true" \
    "$SANDBOX_NET"
fi

echo "==> [5] sandbox egress firewall"
export DEBIAN_FRONTEND=noninteractive
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
apt-get install -y -qq iptables-persistent >/dev/null

cat > /usr/local/sbin/software-agent-sandbox-firewall <<EOF
#!/usr/bin/env bash
# Managed by software-agent scripts/bootstrap-server.sh. Idempotent.
# Sandboxes ($SANDBOX_SUBNET) may reach the internet but not private ranges, other
# sandboxes, the host, or the cloud metadata endpoint. Traefik ($TRAEFIK_IP) may reach sandboxes.
set -euo pipefail
SUBNET="$SANDBOX_SUBNET"
CHAIN=SANDBOX-EGRESS
INCHAIN=SANDBOX-HOST

# Sandbox -> sandbox traffic on the same bridge is only filtered when bridged frames
# traverse iptables.
modprobe br_netfilter 2>/dev/null || true
sysctl -qw net.bridge.bridge-nf-call-iptables=1

iptables -N DOCKER-USER 2>/dev/null || true
iptables -N "\$CHAIN" 2>/dev/null || true
iptables -F "\$CHAIN"
iptables -A "\$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A "\$CHAIN" -s $TRAEFIK_IP/32 -d "\$SUBNET" -j RETURN
iptables -A "\$CHAIN" -s "\$SUBNET" -d 169.254.169.254/32 -j DROP
iptables -A "\$CHAIN" -s "\$SUBNET" -d 169.254.0.0/16 -j DROP
iptables -A "\$CHAIN" -s "\$SUBNET" -d 10.0.0.0/8 -j DROP
iptables -A "\$CHAIN" -s "\$SUBNET" -d 172.16.0.0/12 -j DROP
iptables -A "\$CHAIN" -s "\$SUBNET" -d 192.168.0.0/16 -j DROP
iptables -A "\$CHAIN" -s "\$SUBNET" -d 100.64.0.0/10 -j DROP
iptables -A "\$CHAIN" -j RETURN
iptables -C DOCKER-USER -j "\$CHAIN" 2>/dev/null || iptables -I DOCKER-USER 1 -j "\$CHAIN"

# Traffic addressed to the host itself (e.g. 172.30.0.1:22) goes through INPUT, not FORWARD.
iptables -N "\$INCHAIN" 2>/dev/null || true
iptables -F "\$INCHAIN"
iptables -A "\$INCHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN
iptables -A "\$INCHAIN" -s "\$SUBNET" -j DROP
iptables -A "\$INCHAIN" -j RETURN
iptables -C INPUT -j "\$INCHAIN" 2>/dev/null || iptables -I INPUT 1 -j "\$INCHAIN"
EOF
chmod 755 /usr/local/sbin/software-agent-sandbox-firewall

# Docker rebuilds its chains on start; re-apply ours afterwards on every boot.
cat > /etc/systemd/system/software-agent-sandbox-firewall.service <<'EOF'
[Unit]
Description=software-agent sandbox egress firewall
After=docker.service netfilter-persistent.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/software-agent-sandbox-firewall
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now software-agent-sandbox-firewall.service
/usr/local/sbin/software-agent-sandbox-firewall
netfilter-persistent save >/dev/null

echo "==> [6] nginx site"
if [ -f /etc/letsencrypt/live/agent.ansarisaif.com/fullchain.pem ] \
  && [ -f /etc/nginx/ssl/sandbox.ansarisaif.com/fullchain.pem ]; then
  cp "$SRC/deploy/nginx-software-agent.conf" /etc/nginx/sites-available/software-agent.conf
  ln -sfn /etc/nginx/sites-available/software-agent.conf /etc/nginx/sites-enabled/software-agent.conf
  nginx -t
  systemctl reload nginx
else
  echo "SKIP: TLS certificates missing. Issue them first (see header of deploy/nginx-software-agent.conf):"
  echo "  certbot certonly --webroot -w /var/www/letsencrypt -d agent.ansarisaif.com -d agent-api.ansarisaif.com"
  echo "  acme.sh --issue --dns dns_netlify -d '*.sandbox.ansarisaif.com' (+ --install-cert, see the header)"
  echo "then re-run this script."
fi

echo "==> [7] nightly backup cron"
cat > /etc/cron.d/software-agent-backup <<EOF
# Managed by software-agent scripts/bootstrap-server.sh
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
30 2 * * * $DEPLOY_USER cd $DEPLOY_PATH && BACKUP_DIR=$BACKUP_DIR bash scripts/backup.sh >> $BACKUP_DIR/backup.log 2>&1
EOF
chmod 644 /etc/cron.d/software-agent-backup

cat <<EOF

Bootstrap complete.

DNS (A/AAAA -> this server):
  agent.ansarisaif.com
  agent-api.ansarisaif.com
  *.sandbox.ansarisaif.com
Remove if still present: agent-worker.ansarisaif.com, *.ide.ansarisaif.com

Next:
  1. Fill in $DEPLOY_PATH/.env (chmod 600, owned by $DEPLOY_USER).
  2. Add GitHub secrets DEPLOY_HOST, DEPLOY_USER=$DEPLOY_USER, DEPLOY_SSH_KEY (+ DEPLOY_SSH_FINGERPRINT).
  3. First deploy (as $DEPLOY_USER):  SMOKE_SKIP_PUBLIC=1 bash scripts/deploy.sh <sha>
EOF
