#!/bin/bash
set -e

TARGET_DIR="${TARGET_DIR:-${DEFAULT_WORKSPACE:-/data/workspaces/shared/frontend}}"
CONFIG_DIR="/config"
USER_DIR="$CONFIG_DIR/data/User"

handle_error() {
    echo "[ERROR] $1"
    exit 1
}

echo "[INFO] Starting permission setup for $TARGET_DIR..."

mkdir -p "$TARGET_DIR" || handle_error "Failed to create $TARGET_DIR"
mkdir -p "$CONFIG_DIR" || handle_error "Failed to create $CONFIG_DIR"
mkdir -p "$USER_DIR" || handle_error "Failed to create $USER_DIR"
mkdir -p "$USER_DIR/globalStorage" || handle_error "Failed to create globalStorage"
mkdir -p "$USER_DIR/workspaceStorage" || handle_error "Failed to create workspaceStorage"
mkdir -p "$CONFIG_DIR/.local" || handle_error "Failed to create .local"
mkdir -p "$CONFIG_DIR/.config" || handle_error "Failed to create .config"

echo "[INFO] Setting permissions..."
chown -R abc:abc "$CONFIG_DIR"
chmod -R 777 "$CONFIG_DIR"

chown -R abc:abc "$TARGET_DIR"
chmod -R 777 "$TARGET_DIR"

echo "[INFO] Configuring settings..."
echo '{"workbench.colorTheme": "Default Dark+"}' > "$USER_DIR/settings.json"
chown abc:abc "$USER_DIR/settings.json"
chmod 666 "$USER_DIR/settings.json"

if [ -z "$(ls -A $TARGET_DIR 2>/dev/null)" ]; then
    echo "[INFO] Initializing workspace from template..."
    cp -r /template/. "$TARGET_DIR" || handle_error "Failed to copy template"
    chown -R abc:abc "$TARGET_DIR"
    chmod -R 777 "$TARGET_DIR"
fi

echo "[INFO] Permission setup complete. Starting code-server..."
exec /init
