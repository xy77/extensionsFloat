#!/bin/bash
set -euo pipefail

HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$HOST_DIR/updater-macos.sh"
