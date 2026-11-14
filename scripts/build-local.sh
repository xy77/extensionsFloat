#!/bin/bash
# 生成本地测试包：只写 dist/，不修改版本号、不修改 latest.json、不触发发版。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION="$(node -p "require('$ROOT_DIR/manifest.json').version")"
DIST_DIR="$ROOT_DIR/dist"
BUILD_NAME="float-extension-local"
BUILD_DIR="$DIST_DIR/$BUILD_NAME"
ZIP_NAME="float-extension-local-v$VERSION.zip"
STAGE_ZIP="$DIST_DIR/.stage-v$VERSION.zip"

cd "$ROOT_DIR"
mkdir -p "$DIST_DIR"
rm -rf "$BUILD_DIR" "$STAGE_ZIP" "$DIST_DIR/$ZIP_NAME"

# 排除规则与 .github/workflows/release-extension.yml 保持一致，
# 另外排除 .gitignore / .gitattributes（本地测试包不需要）。
zip -q -r "$STAGE_ZIP" . \
  -x ".git/*" \
  -x ".github/*" \
  -x ".workbuddy/*" \
  -x "node_modules/*" \
  -x "backups/*" \
  -x "logs/*" \
  -x "data/*" \
  -x "dist/*" \
  -x "latest.json" \
  -x ".env" \
  -x "config.local.json" \
  -x "native-host/config.json" \
  -x ".gitignore" \
  -x ".gitattributes" \
  -x ".DS_Store" \
  -x "*/.DS_Store"

mkdir -p "$BUILD_DIR"
unzip -q "$STAGE_ZIP" -d "$BUILD_DIR"
rm -f "$STAGE_ZIP"

if [ ! -f "$BUILD_DIR/manifest.json" ]; then
  echo "构建失败：$BUILD_DIR/manifest.json 不存在" >&2
  exit 1
fi

(cd "$DIST_DIR" && zip -q -r "$ZIP_NAME" "$BUILD_NAME")
SHA256="$(shasum -a 256 "$DIST_DIR/$ZIP_NAME" | awk '{print $1}')"

echo "本地测试包已生成（未发布 / 未改版本号 / 未改 latest.json）"
echo "  加载目录 : $BUILD_DIR"
echo "  分发 zip : $DIST_DIR/$ZIP_NAME"
echo "  版本     : ${VERSION}（与线上一致，不会触发自动更新）"
echo "  sha256   : $SHA256"
echo ""
echo "Chrome 测试：chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选择上面的「加载目录」。"
