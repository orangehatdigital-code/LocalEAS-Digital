#!/usr/bin/env bash
set -e

# ==========================================
# LocalEAS Digital - WSL2 Runner Script
# Developed by OrangeHat Digital
# ==========================================

USER_HOME="${HOME:-/home/$(whoami)}"
if [ -d "$USER_HOME/.nvm/versions/node" ]; then
  LATEST_NVM_BIN="$(ls -d "$USER_HOME/.nvm/versions/node"/*/bin 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -n "$LATEST_NVM_BIN" ]; then
    export PATH="${LATEST_NVM_BIN}:${PATH}"
  fi
fi

export PATH="${PATH}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/package.json" ]; then
  PROJECT_ROOT="$SCRIPT_DIR"
else
  PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

cd "$PROJECT_ROOT"

BUILDS_DIR="${BUILDS_ROOT:-$USER_HOME/builds}"
mkdir -p "$BUILDS_DIR/logs"

# If already running, do nothing
if pgrep -f '[n]ext-server' >/dev/null 2>&1; then
  echo "LocalEAS Digital is already running."
  exit 0
fi

# Ensure .next exists
if [ ! -d "$PROJECT_ROOT/.next" ]; then
  echo "Building LocalEAS Digital..."
  npm run build >> "$BUILDS_DIR/logs/dashboard-server.log" 2>&1
fi

# Detached background daemon using setsid + nohup
setsid nohup npx next start -H 0.0.0.0 -p 3000 >> "$BUILDS_DIR/logs/dashboard-server.log" 2>&1 < /dev/null &
sleep 1
exit 0
