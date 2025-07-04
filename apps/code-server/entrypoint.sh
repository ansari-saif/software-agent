#!/bin/sh
set -e

TARGET_DIR="/tmp/stich-worker"
CONFIG_DIR="/config/data/User"
TASKS_DIR="$TARGET_DIR/.vscode"
TASKS_FILE="$TASKS_DIR/tasks.json"

# Create all necessary directories with proper permissions
mkdir -p "$TARGET_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$CONFIG_DIR/globalStorage"
mkdir -p "$CONFIG_DIR/workspaceStorage"

# Set full permissions for TARGET_DIR first
chmod -R 777 "$TARGET_DIR"
chown -R abc:abc "$TARGET_DIR"

# Set ownership for all config directories
chown -R abc:abc /config
chmod -R 755 /config
chmod g+rwx,o+rx /config
find /config -type d -exec chmod 755 {} \;
find /config -type f -exec chmod 644 {} \;

# Configure dark mode
echo '{"workbench.colorTheme": "Default Dark+"}' > "$CONFIG_DIR/settings.json"
chown abc:abc "$CONFIG_DIR/settings.json"
chmod 644 "$CONFIG_DIR/settings.json"

# Handle template copying
if [ -z "$(ls -A $TARGET_DIR)" ]; then
  echo "[INFO] Initializing /tmp/stich-worker from template..."
  cp -r /template/. "$TARGET_DIR"
  chown -R abc:abc "$TARGET_DIR"
  chmod -R 777 "$TARGET_DIR"  # Ensure full permissions after copying
  echo "[INFO] Template initialization complete with full permissions"
else
  echo "[INFO] /tmp/stich-worker already initialized."
fi

# Create VS Code tasks
if [ ! -f "$TASKS_FILE" ]; then
  echo "[INFO] Creating VS Code tasks.json..."
  mkdir -p "$TASKS_DIR"
  chmod 777 "$TASKS_DIR"
  cat > "$TASKS_FILE" <<EOF
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Running the project",
      "type": "shell",
      "command": "uvicorn",
      "args": ["app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"],
      "problemMatcher": [],
      "presentation": {
        "reveal": "always",
        "panel": "shared"
      },
      "runOptions": {
        "runOn": "folderOpen"
      }
    }
  ]
}
EOF
  chown -R abc:abc "$TASKS_DIR"
  chmod 666 "$TASKS_FILE"  # Make tasks file writable
else
  echo "[INFO] tasks.json already exists. Skipping creation."
fi

# Double-check and ensure permissions
echo "[INFO] Ensuring final permissions..."
chmod -R 777 "$TARGET_DIR"
chown -R abc:abc "$TARGET_DIR"

# Verify permissions
echo "[INFO] Config directory permissions:"
ls -la /config/data/User/globalStorage || true
echo "[INFO] Workspace directory status:"
ls -la "$TARGET_DIR" || true
echo "[INFO] Workspace files permissions:"
find "$TARGET_DIR" -type f -exec ls -l {} \; || true

# Start code-server as abc user
exec /init
