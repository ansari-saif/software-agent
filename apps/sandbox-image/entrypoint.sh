#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_DIR="${DEFAULT_WORKSPACE:-/workspace}"
CONFIG_DIR="/config"
USER_DIR="$CONFIG_DIR/data/User"

mkdir -p "$WORKSPACE_DIR" "$USER_DIR" "$CONFIG_DIR/.local" "$CONFIG_DIR/.config" /tmp/processes
# Numeric ids: this runs before /init remaps `abc` to PUID/PGID, so `abc` is still uid 911
# here. The workspace is a host bind mount shared with the controller (uid 1000).
OWNER="${PUID:-1000}:${PGID:-1000}"
chown -R "$OWNER" "$WORKSPACE_DIR" "$CONFIG_DIR" /tmp/processes
chmod 750 "$WORKSPACE_DIR" "$CONFIG_DIR" /tmp/processes

if [ ! -f "$USER_DIR/settings.json" ]; then
  echo '{"workbench.colorTheme": "Default Dark+", "security.workspace.trust.enabled": false}' > "$USER_DIR/settings.json"
  chown "$OWNER" "$USER_DIR/settings.json"
  chmod 640 "$USER_DIR/settings.json"
fi

# Configure git identity inside workspace for automated run snapshots
GITCONFIG="$CONFIG_DIR/.gitconfig"
git config --file "$GITCONFIG" user.name "Software Agent"
git config --file "$GITCONFIG" user.email "agent@localhost"
git config --file "$GITCONFIG" init.defaultBranch main
chown "$OWNER" "$GITCONFIG"

exec /init
