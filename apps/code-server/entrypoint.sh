#!/bin/sh
set -e

TARGET_DIR="/tmp/stich-worker"
CONFIG_DIR="/config/data/User"
TASKS_DIR="$TARGET_DIR/.vscode"
TASKS_FILE="$TASKS_DIR/tasks.json"

# Configure dark mode
mkdir -p /config/data/User
echo '{"workbench.colorTheme": "Default Dark+"}' > /config/data/User/settings.json
chown -R abc:abc /config/data

# If the target directory is empty, copy contents from template
if [ -z "$(ls -A $TARGET_DIR)" ]; then
  echo "[INFO] Initializing /tmp/stich-worker from template..."
  cp -r /template/. "$TARGET_DIR"
else
  echo "[INFO] /tmp/stich-worker already initialized."
fi

if [ ! -f "$TASKS_FILE" ]; then
  echo "[INFO] Creating VS Code tasks.json..."
  mkdir -p "$TASKS_DIR"
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
else
  echo "[INFO] tasks.json already exists. Skipping creation."
fi


# Now launch code-server
exec /init
