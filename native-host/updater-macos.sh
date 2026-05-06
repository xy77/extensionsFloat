#!/bin/bash
set -uo pipefail

HOST_VERSION="1.1.0-macos"
BACKUP_DIR_NAME="backups"
HOST_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_PATH="$HOST_DIR/config.json"

PRESERVE_PATHS=(
  ".env"
  "config.local.json"
  "data"
  "logs"
  "native-host/config.json"
)

json_escape() {
  local value="${1-}"
  value="${value//$'\r'/ }"
  value="${value//$'\n'/ }"
  value="${value//$'\t'/ }"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '%s' "$value"
}

write_native_json() {
  local body="$1"
  local length byte1 byte2 byte3 byte4

  length="$(LC_ALL=C printf '%s' "$body" | /usr/bin/wc -c | /usr/bin/tr -d ' ')"
  byte1="$(printf '%02x' $((length & 255)))"
  byte2="$(printf '%02x' $(((length >> 8) & 255)))"
  byte3="$(printf '%02x' $(((length >> 16) & 255)))"
  byte4="$(printf '%02x' $(((length >> 24) & 255)))"

  printf '%b' "\\x$byte1\\x$byte2\\x$byte3\\x$byte4"
  printf '%s' "$body"
}

respond_error() {
  local code message
  code="$(json_escape "$1")"
  message="$(json_escape "$2")"
  write_native_json "{\"ok\":false,\"code\":\"$code\",\"message\":\"$message\"}"
}

respond_ok() {
  write_native_json "$1"
}

fail() {
  respond_error "$1" "$2"
  exit 0
}

require_tool() {
  local tool="$1"
  local path="$2"

  if [[ ! -x "$path" ]]; then
    fail "TOOL_MISSING" "缺少 macOS 系统工具：$tool。"
  fi
}

get_json_value() {
  local key="$1"
  local file="$2"
  /usr/bin/plutil -extract "$key" raw -o - "$file" 2>/dev/null
}

get_json_value_or_empty() {
  local value
  if value="$(get_json_value "$1" "$2" 2>/dev/null)"; then
    printf '%s' "$value"
  fi
}

read_native_message() {
  local message_file="$1"
  local header_hex length

  header_hex="$(/bin/dd bs=4 count=1 2>/dev/null | /usr/bin/xxd -p -c 4)"
  if [[ "${#header_hex}" -ne 8 ]]; then
    fail "INVALID_NATIVE_MESSAGE" "Native message header 无效。"
  fi

  length=$((16#${header_hex:6:2}${header_hex:4:2}${header_hex:2:2}${header_hex:0:2}))
  if (( length <= 0 || length > 1048576 )); then
    fail "INVALID_NATIVE_MESSAGE" "Native message 长度无效。"
  fi

  if ! /bin/dd bs=1 count="$length" of="$message_file" 2>/dev/null; then
    fail "INVALID_NATIVE_MESSAGE" "Native message body 读取失败。"
  fi

  # macOS plutil can extract keys from JSON files, but `plutil -lint`
  # only validates plist syntax on some system versions.
}

normalize_extension_dir() {
  local extension_dir="${1-}"

  if [[ -z "$extension_dir" && -f "$CONFIG_PATH" ]]; then
    extension_dir="$(get_json_value_or_empty "extensionDir" "$CONFIG_PATH")"
  fi

  if [[ -z "$extension_dir" ]]; then
    fail "EXTENSION_DIR_MISSING" "缺少 extensionDir，请重新安装 Native Host。"
  fi

  if [[ "$extension_dir" != /* ]]; then
    fail "EXTENSION_DIR_INVALID" "extensionDir 必须是绝对路径。"
  fi

  if [[ ! -d "$extension_dir" ]]; then
    fail "EXTENSION_DIR_INVALID" "extensionDir 不存在或不是目录。"
  fi

  (cd "$extension_dir" && pwd -P)
}

assert_not_git_worktree() {
  local extension_dir="$1"

  if [[ -e "$extension_dir/.git" ]]; then
    fail "EXTENSION_DIR_IS_GIT_REPO" "extensionDir 指向 Git 仓库。请把插件加载到一个独立安装目录，再重新安装 Native Host，避免 updater 覆盖源码仓库。"
  fi
}

normalize_semver() {
  local version="${1#v}"
  version="${version%%[-+]*}"

  if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    return 1
  fi

  printf '%s %s %s\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
}

compare_semver() {
  local left="$1"
  local right="$2"
  local l_major l_minor l_patch r_major r_minor r_patch

  if ! read -r l_major l_minor l_patch < <(normalize_semver "$left"); then
    fail "INVALID_VERSION" "版本号不是 semver：$left"
  fi

  if ! read -r r_major r_minor r_patch < <(normalize_semver "$right"); then
    fail "INVALID_VERSION" "版本号不是 semver：$right"
  fi

  if (( l_major != r_major )); then
    (( l_major > r_major )) && printf '1\n' || printf -- '-1\n'
    return
  fi

  if (( l_minor != r_minor )); then
    (( l_minor > r_minor )) && printf '1\n' || printf -- '-1\n'
    return
  fi

  if (( l_patch != r_patch )); then
    (( l_patch > r_patch )) && printf '1\n' || printf -- '-1\n'
    return
  fi

  printf '0\n'
}

copy_path() {
  local source="$1"
  local destination="$2"

  /bin/mkdir -p "$(/usr/bin/dirname "$destination")"
  /usr/bin/ditto "$source" "$destination"
}

copy_preserved_entries() {
  local extension_dir="$1"
  local preserved_dir="$2"
  local item

  /bin/mkdir -p "$preserved_dir"
  for item in "${PRESERVE_PATHS[@]}"; do
    if [[ -e "$extension_dir/$item" ]]; then
      copy_path "$extension_dir/$item" "$preserved_dir/$item"
    fi
  done
}

restore_preserved_entries() {
  local preserved_dir="$1"
  local extension_dir="$2"

  if [[ -d "$preserved_dir" ]]; then
    /usr/bin/rsync -a "$preserved_dir"/ "$extension_dir"/
  fi
}

remove_extension_contents() {
  local extension_dir="$1"
  /usr/bin/find "$extension_dir" -mindepth 1 -maxdepth 1 ! -name "$BACKUP_DIR_NAME" -exec /bin/rm -rf {} +
}

create_backup() {
  local extension_dir="$1"
  local backup_root backup_dir

  backup_root="$extension_dir/$BACKUP_DIR_NAME"
  backup_dir="$backup_root/backup-$(/bin/date -u '+%Y-%m-%dT%H-%M-%SZ')-$$"
  /bin/mkdir -p "$backup_dir"

  /usr/bin/rsync -a --exclude="/$BACKUP_DIR_NAME/" "$extension_dir"/ "$backup_dir"/
  printf '%s\n' "$backup_dir"
}

rollback_from_backup() {
  local extension_dir="$1"
  local backup_dir="$2"

  if [[ -z "$backup_dir" || ! -d "$backup_dir" ]]; then
    return 0
  fi

  remove_extension_contents "$extension_dir"
  /usr/bin/rsync -a "$backup_dir"/ "$extension_dir"/
}

update_fail() {
  local code="$1"
  local message="$2"
  local extension_dir="${3-}"
  local backup_dir="${4-}"

  if [[ -n "$extension_dir" && -n "$backup_dir" && -d "$backup_dir" ]]; then
    if rollback_from_backup "$extension_dir" "$backup_dir"; then
      fail "$code" "$message 已自动回滚。"
    fi

    fail "ROLLBACK_FAILED" "$message；回滚失败。"
  fi

  fail "$code" "$message"
}

find_manifest_root() {
  local extracted_dir="$1"
  local manifest_path

  if [[ -f "$extracted_dir/manifest.json" ]]; then
    printf '%s\n' "$extracted_dir"
    return 0
  fi

  manifest_path="$(/usr/bin/find "$extracted_dir" -mindepth 2 -maxdepth 2 -name manifest.json -type f -print -quit)"
  if [[ -z "$manifest_path" ]]; then
    return 1
  fi

  /usr/bin/dirname "$manifest_path"
}

handle_check() {
  local message_file="$1"
  local extension_dir current_version body

  current_version="$(get_json_value_or_empty "currentVersion" "$message_file")"
  extension_dir="$(normalize_extension_dir "$(get_json_value_or_empty "extensionDir" "$message_file")")"
  assert_not_git_worktree "$extension_dir"

  body="{\"ok\":true,\"hostVersion\":\"$(json_escape "$HOST_VERSION")\",\"platform\":\"darwin\",\"extensionDir\":\"$(json_escape "$extension_dir")\",\"currentVersion\":\"$(json_escape "$current_version")\",\"message\":\"ready\"}"
  respond_ok "$body"
}

handle_update() {
  local message_file="$1"
  local current_version latest_version download_url sha256 extension_dir comparison
  local temp_dir zip_path extracted_dir preserved_dir package_root manifest_version actual_hash curl_error backup_dir

  current_version="$(get_json_value_or_empty "currentVersion" "$message_file")"
  latest_version="$(get_json_value_or_empty "latestVersion" "$message_file")"
  latest_version="${latest_version#v}"
  download_url="$(get_json_value_or_empty "downloadUrl" "$message_file")"
  sha256="$(get_json_value_or_empty "sha256" "$message_file" | /usr/bin/tr '[:upper:]' '[:lower:]')"
  extension_dir="$(normalize_extension_dir "$(get_json_value_or_empty "extensionDir" "$message_file")")"
  backup_dir=""

  assert_not_git_worktree "$extension_dir"

  comparison="$(compare_semver "$latest_version" "$current_version")"
  if (( comparison <= 0 )); then
    fail "ALREADY_UP_TO_DATE" "当前已经是最新版本。"
  fi

  if [[ ! "$download_url" =~ ^https:// ]]; then
    fail "DOWNLOAD_URL_INVALID" "downloadUrl 必须使用 HTTPS。"
  fi

  if [[ -n "$sha256" && ! "$sha256" =~ ^[a-f0-9]{64}$ ]]; then
    fail "HASH_INVALID" "sha256 格式不正确。"
  fi

  temp_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/float-updater.XXXXXX")"
  zip_path="$temp_dir/extension-v$latest_version.zip"
  extracted_dir="$temp_dir/extracted"
  preserved_dir="$temp_dir/preserved"

  if ! /usr/bin/curl -fL --retry 2 --connect-timeout 20 --max-time 300 -A "float-extension-updater" -o "$zip_path" "$download_url" 2>"$temp_dir/curl.err"; then
    curl_error="$(/bin/cat "$temp_dir/curl.err" 2>/dev/null || true)"
    /bin/rm -rf "$temp_dir"
    fail "DOWNLOAD_FAILED" "下载失败：${curl_error:-curl 请求失败。}"
  fi

  if [[ -n "$sha256" ]]; then
    actual_hash="$(/usr/bin/shasum -a 256 "$zip_path" | /usr/bin/awk '{print $1}')"
    if [[ "$actual_hash" != "$sha256" ]]; then
      /bin/rm -rf "$temp_dir"
      fail "HASH_MISMATCH" "下载包 sha256 校验失败。"
    fi
  fi

  /bin/mkdir -p "$extracted_dir"
  if ! /usr/bin/ditto -x -k "$zip_path" "$extracted_dir"; then
    /bin/rm -rf "$temp_dir"
    fail "UNZIP_FAILED" "更新包解压失败。"
  fi

  if ! package_root="$(find_manifest_root "$extracted_dir")"; then
    /bin/rm -rf "$temp_dir"
    fail "PACKAGE_INVALID" "更新包中没有找到 manifest.json。"
  fi

  manifest_version="$(get_json_value_or_empty "version" "$package_root/manifest.json")"
  if [[ "$manifest_version" != "$latest_version" ]]; then
    /bin/rm -rf "$temp_dir"
    fail "VERSION_MISMATCH" "更新包版本 ${manifest_version:-empty} 与 latest.json $latest_version 不一致。"
  fi

  if ! backup_dir="$(create_backup "$extension_dir")"; then
    /bin/rm -rf "$temp_dir"
    fail "BACKUP_FAILED" "备份当前插件失败。"
  fi

  if ! copy_preserved_entries "$extension_dir" "$preserved_dir"; then
    update_fail "PRESERVE_FAILED" "保存本机配置失败。" "$extension_dir" "$backup_dir"
  fi

  if ! remove_extension_contents "$extension_dir"; then
    update_fail "REPLACE_FAILED" "清理旧版本文件失败。" "$extension_dir" "$backup_dir"
  fi

  if ! /usr/bin/rsync -a \
    --exclude="/.env" \
    --exclude="/config.local.json" \
    --exclude="/data/" \
    --exclude="/logs/" \
    --exclude="/native-host/config.json" \
    "$package_root"/ "$extension_dir"/; then
    update_fail "REPLACE_FAILED" "复制新版本文件失败。" "$extension_dir" "$backup_dir"
  fi

  if ! restore_preserved_entries "$preserved_dir" "$extension_dir"; then
    update_fail "RESTORE_PRESERVED_FAILED" "恢复本机配置失败。" "$extension_dir" "$backup_dir"
  fi

  /bin/rm -rf "$temp_dir"

  respond_ok "{\"ok\":true,\"version\":\"$(json_escape "$latest_version")\",\"backupDir\":\"$(json_escape "$backup_dir")\",\"message\":\"updated\"}"
}

main() {
  local temp_dir message_file command

  require_tool "xxd" "/usr/bin/xxd"
  require_tool "plutil" "/usr/bin/plutil"
  require_tool "curl" "/usr/bin/curl"
  require_tool "ditto" "/usr/bin/ditto"
  require_tool "shasum" "/usr/bin/shasum"
  require_tool "rsync" "/usr/bin/rsync"

  temp_dir="$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/float-native-message.XXXXXX")"
  message_file="$temp_dir/message.json"
  read_native_message "$message_file"

  command="$(get_json_value_or_empty "command" "$message_file")"

  case "$command" in
    ping)
      respond_ok "{\"ok\":true,\"hostVersion\":\"$(json_escape "$HOST_VERSION")\",\"message\":\"pong\"}"
      ;;
    check)
      handle_check "$message_file"
      ;;
    update)
      handle_update "$message_file"
      ;;
    *)
      fail "UNKNOWN_COMMAND" "未知命令：${command:-empty}"
      ;;
  esac

  /bin/rm -rf "$temp_dir"
}

main
