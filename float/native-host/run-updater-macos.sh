#!/usr/bin/env bash
set -euo pipefail

HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
exec /usr/bin/env node "$HOST_DIR/updater.js"
