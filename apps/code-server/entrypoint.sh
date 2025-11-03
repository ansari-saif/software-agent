#!/bin/bash
set -e

# Configuration
TARGET_DIR="/Users/saif/stich/stich-worker"
CONFIG_DIR="/config"
USER_DIR="$CONFIG_DIR/data/User"
TASKS_DIR="$TARGET_DIR/.vscode"
TASKS_FILE="$TASKS_DIR/tasks.json"

# Function to handle errors
handle_error() {
    echo "[ERROR] $1"
    exit 1
}

echo "[INFO] Starting permission setup..."

# Create all necessary directories
mkdir -p "$TARGET_DIR" || handle_error "Failed to create $TARGET_DIR"
mkdir -p "$CONFIG_DIR" || handle_error "Failed to create $CONFIG_DIR"
mkdir -p "$USER_DIR" || handle_error "Failed to create $USER_DIR"
mkdir -p "$USER_DIR/globalStorage" || handle_error "Failed to create globalStorage"
mkdir -p "$USER_DIR/workspaceStorage" || handle_error "Failed to create workspaceStorage"
mkdir -p "$CONFIG_DIR/.local" || handle_error "Failed to create .local"
mkdir -p "$CONFIG_DIR/.config" || handle_error "Failed to create .config"

# Set aggressive permissions for the config directory
echo "[INFO] Setting permissions..."
chown -R abc:abc "$CONFIG_DIR"
chmod -R 777 "$CONFIG_DIR"

# Set permissions for target directory
chown -R abc:abc "$TARGET_DIR"
chmod -R 777 "$TARGET_DIR"

# Configure dark mode
echo "[INFO] Configuring settings..."
echo '{"workbench.colorTheme": "Default Dark+"}' > "$USER_DIR/settings.json"
chown abc:abc "$USER_DIR/settings.json"
chmod 666 "$USER_DIR/settings.json"

# Handle template copying
if [ -z "$(ls -A $TARGET_DIR)" ]; then
    echo "[INFO] Initializing workspace from template..."
    cp -r /template/. "$TARGET_DIR" || handle_error "Failed to copy template"
    chown -R abc:abc "$TARGET_DIR"
    chmod -R 777 "$TARGET_DIR"
fi

# Create VS Code tasks
if [ ! -f "$TASKS_FILE" ]; then
    echo "[INFO] Creating VS Code tasks..."
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
    chmod -R 777 "$TASKS_DIR"
fi

# Verify permissions
echo "[INFO] Verifying permissions..."
ls -la "$USER_DIR/globalStorage" || echo "[WARN] Could not verify globalStorage"
ls -la "$TARGET_DIR" || echo "[WARN] Could not verify workspace"

echo "[INFO] Permission setup complete. Starting code-server..."

# Let s6-overlay handle the rest
exec /init
