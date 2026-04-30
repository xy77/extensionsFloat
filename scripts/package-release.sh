#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GITHUB_REPO="${GITHUB_REPO:-xy77/extensionsFloat}"
DIST_DIR="$ROOT_DIR/dist"
VERSION="$(/usr/bin/plutil -extract version raw -o - "$ROOT_DIR/manifest.json")"
ZIP_NAME="extension-v$VERSION.zip"
ZIP_PATH="$DIST_DIR/$ZIP_NAME"
LATEST_PATH="$DIST_DIR/latest.json"
ROOT_LATEST_PATH="$ROOT_DIR/latest.json"
DOWNLOAD_URL="https://github.com/$GITHUB_REPO/releases/download/v$VERSION/$ZIP_NAME"

cd "$ROOT_DIR"
mkdir -p "$DIST_DIR"
rm -f "$ZIP_PATH" "$LATEST_PATH"

zip -r "$ZIP_PATH" . \
  -x ".git/*" \
  -x "node_modules/*" \
  -x "backups/*" \
  -x "logs/*" \
  -x "data/*" \
  -x "dist/*" \
  -x "latest.json" \
  -x ".env" \
  -x "config.local.json" \
  -x "native-host/config.json" \
  -x ".DS_Store" \
  -x "*/.DS_Store"

SHA256="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"

cat > "$LATEST_PATH" <<JSON
{
  "version": "$VERSION",
  "downloadUrl": "$DOWNLOAD_URL",
  "sha256": "$SHA256",
  "changelog": "Describe changes for v$VERSION here."
}
JSON

cp "$LATEST_PATH" "$ROOT_LATEST_PATH"

echo "Release package created:"
echo "  $ZIP_PATH"
echo "  $LATEST_PATH"
echo "  $ROOT_LATEST_PATH"
echo "  sha256: $SHA256"
