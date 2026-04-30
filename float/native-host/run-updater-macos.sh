#!/usr/bin/env bash
set -euo pipefail

HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN_PATH="$HOST_DIR/node-bin"

if [[ -f "$NODE_BIN_PATH" ]]; then
  IFS= read -r NODE_BIN < "$NODE_BIN_PATH" || NODE_BIN=""
  if [[ -n "$NODE_BIN" && -x "$NODE_BIN" ]]; then
    exec "$NODE_BIN" "$HOST_DIR/updater.js"
  fi
fi

for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  if [[ -x "$candidate" ]]; then
    exec "$candidate" "$HOST_DIR/updater.js"
  fi
done

exec /usr/bin/env node "$HOST_DIR/updater.js"
