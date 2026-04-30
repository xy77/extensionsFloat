#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.float.extension_updater"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
EXTENSION_ID="${1:-}"
EXTENSION_DIR="${2:-$ROOT_DIR}"
HOST_DIR="$ROOT_DIR/native-host"
WRAPPER_PATH="$HOST_DIR/run-updater-macos.sh"
UPDATER_PATH="$HOST_DIR/updater.js"
CONFIG_PATH="$HOST_DIR/config.json"
NODE_BIN_PATH="$HOST_DIR/node-bin"
CHROME_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_MANIFEST_PATH="$CHROME_HOST_DIR/$HOST_NAME.json"

find_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  local candidates=(
    "/opt/homebrew/bin/node"
    "/usr/local/bin/node"
    "/usr/bin/node"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

if [[ -z "$EXTENSION_ID" ]]; then
  echo "Usage: $0 <EXTENSION_ID> [EXTENSION_DIR]" >&2
  echo "Example: $0 abcdefghijklmnopqrstuvwxyzabcdef" >&2
  exit 1
fi

if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Invalid Chrome extension ID: $EXTENSION_ID" >&2
  echo "Open chrome://extensions, copy this extension's 32-character ID, then run this script again." >&2
  exit 1
fi

if [[ ! -f "$UPDATER_PATH" || ! -f "$WRAPPER_PATH" ]]; then
  echo "Native host files are missing under $HOST_DIR" >&2
  exit 1
fi

NODE_BIN="${NODE_BIN:-}"
if [[ -n "$NODE_BIN" ]]; then
  if [[ ! -x "$NODE_BIN" ]]; then
    echo "NODE_BIN is set but not executable: $NODE_BIN" >&2
    exit 1
  fi
elif ! NODE_BIN="$(find_node)"; then
  cat >&2 <<'EOF'
Node.js is required by the Native Messaging updater, but the `node` command was not found.

Install Node.js LTS first, then run this script again:
  https://nodejs.org/

If Node is installed through nvm or another custom location, pass its absolute path:
  NODE_BIN="/absolute/path/to/node" ./scripts/install-native-host-macos.sh <EXTENSION_ID> "$(pwd)"
EOF
  exit 1
fi

mkdir -p "$CHROME_HOST_DIR"
chmod +x "$WRAPPER_PATH" "$UPDATER_PATH"

"$NODE_BIN" -e "const fs=require('fs'); fs.writeFileSync(process.argv[1], JSON.stringify({ extensionDir: process.argv[2], nodeBin: process.argv[3] }, null, 2) + '\n')" "$CONFIG_PATH" "$EXTENSION_DIR" "$NODE_BIN"
printf '%s\n' "$NODE_BIN" > "$NODE_BIN_PATH"

"$NODE_BIN" -e "const fs=require('fs'); const [file,name,hostPath,id]=process.argv.slice(1); fs.writeFileSync(file, JSON.stringify({ name, description: 'Float extension updater', path: hostPath, type: 'stdio', allowed_origins: ['chrome-extension://' + id + '/'] }, null, 2) + '\n')" "$HOST_MANIFEST_PATH" "$HOST_NAME" "$WRAPPER_PATH" "$EXTENSION_ID"

echo "Native Messaging host installed:"
echo "  Host: $HOST_NAME"
echo "  Manifest: $HOST_MANIFEST_PATH"
echo "  Extension dir: $EXTENSION_DIR"
echo "  Node: $NODE_BIN"
