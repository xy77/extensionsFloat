#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="com.float.extension_updater"
HOST_MANIFEST_PATH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json"

if [[ -f "$HOST_MANIFEST_PATH" ]]; then
  rm "$HOST_MANIFEST_PATH"
  echo "Removed $HOST_MANIFEST_PATH"
else
  echo "Native Messaging host manifest not found: $HOST_MANIFEST_PATH"
fi
