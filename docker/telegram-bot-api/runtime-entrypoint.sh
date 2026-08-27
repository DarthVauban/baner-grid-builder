#!/usr/bin/env sh
set -eu

credentials_file="${TELEGRAM_RUNTIME_CREDENTIALS_FILE:-/run/mt-telegram-config/credentials.env}"
bootstrap_api_id="${TELEGRAM_API_ID:-}"
bootstrap_api_hash="${TELEGRAM_API_HASH:-}"
work_dir="${TELEGRAM_WORK_DIR:-/var/lib/telegram-bot-api}"
temp_dir="${TELEGRAM_TEMP_DIR:-/tmp/telegram-bot-api}"
http_port="${TELEGRAM_HTTP_PORT:-8081}"
verbosity="${TELEGRAM_VERBOSITY:-1}"
child_pid=""

credential_signature() {
  if [ -f "$credentials_file" ]; then
    sha256sum "$credentials_file" | cut -d ' ' -f 1
    return
  fi
  printf '%s\n%s\n' "$bootstrap_api_id" "$bootstrap_api_hash" | sha256sum | cut -d ' ' -f 1
}

load_credentials() {
  runtime_api_id=""
  runtime_api_hash=""
  if [ -f "$credentials_file" ]; then
    runtime_api_id="$(sed -n 's/^TELEGRAM_API_ID=//p' "$credentials_file" | tail -n 1 | tr -d '\r')"
    runtime_api_hash="$(sed -n 's/^TELEGRAM_API_HASH=//p' "$credentials_file" | tail -n 1 | tr -d '\r')"
  fi

  case "$runtime_api_id" in
    ''|*[!0-9]*) runtime_api_id="$bootstrap_api_id"; runtime_api_hash="$bootstrap_api_hash" ;;
  esac
  case "$runtime_api_hash" in
    ''|*[!0-9a-fA-F]*) runtime_api_id="$bootstrap_api_id"; runtime_api_hash="$bootstrap_api_hash" ;;
  esac
  if [ -n "$runtime_api_hash" ] && [ "${#runtime_api_hash}" -ne 32 ]; then
    runtime_api_id="$bootstrap_api_id"
    runtime_api_hash="$bootstrap_api_hash"
  fi

  TELEGRAM_API_ID="$runtime_api_id"
  TELEGRAM_API_HASH="$runtime_api_hash"
  export TELEGRAM_API_ID TELEGRAM_API_HASH
  [ -n "$TELEGRAM_API_ID" ] && [ -n "$TELEGRAM_API_HASH" ]
}

stop_child() {
  if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
    kill -TERM "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  child_pid=""
}

shutdown() {
  stop_child
  exit 0
}
trap shutdown INT TERM

mkdir -p "$work_dir" "$temp_dir"
chown telegram-bot-api:telegram-bot-api "$work_dir" "$temp_dir"

while :; do
  if ! load_credentials; then
    echo "Telegram Bot API is waiting for API_ID and API_HASH from MT Workspace."
    sleep 10
    continue
  fi

  active_signature="$(credential_signature)"
  echo "Starting Telegram Bot API with the current MT Workspace credentials."
  telegram-bot-api \
    --local \
    --dir="$work_dir" \
    --temp-dir="$temp_dir" \
    --http-port="$http_port" \
    --verbosity="$verbosity" \
    --username=telegram-bot-api \
    --groupname=telegram-bot-api &
  child_pid=$!

  while kill -0 "$child_pid" 2>/dev/null; do
    sleep 3
    if [ "$(credential_signature)" != "$active_signature" ]; then
      echo "Telegram API credentials changed; restarting the local server."
      stop_child
      break
    fi
  done

  if [ -n "$child_pid" ]; then
    wait "$child_pid" 2>/dev/null || true
    child_pid=""
  fi
  sleep 2
done
