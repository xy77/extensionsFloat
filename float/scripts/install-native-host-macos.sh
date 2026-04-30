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
CHROME_HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_MANIFEST_PATH="$CHROME_HOST_DIR/$HOST_NAME.json"

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

mkdir -p "$CHROME_HOST_DIR"
chmod +x "$WRAPPER_PATH" "$UPDATER_PATH"

node -e "const fs=require('fs'); fs.writeFileSync(process.argv[1], JSON.stringify({ extensionDir: process.argv[2] }, null, 2) + '\n')" "$CONFIG_PATH" "$EXTENSION_DIR"

node -e "const fs=require('fs'); const [file,name,hostPath,id]=process.argv.slice(1); fs.writeFileSync(file, JSON.stringify({ name, description: 'Float extension updater', path: hostPath, type: 'stdio', allowed_origins: ['chrome-extension://' + id + '/'] }, null, 2) + '\n')" "$HOST_MANIFEST_PATH" "$HOST_NAME" "$WRAPPER_PATH" "$EXTENSION_ID"

echo "Native Messaging host installed:"
echo "  Host: $HOST_NAME"
echo "  Manifest: $HOST_MANIFEST_PATH"
echo "  Extension dir: $EXTENSION_DIR"
