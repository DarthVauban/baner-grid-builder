#!/usr/bin/env bash
set -euo pipefail

# This configuration belongs to the disposable Ubuntu Actions runner. A failed
# index refresh must not fall through to installing packages from stale indexes.
sudo tee /etc/apt/apt.conf.d/80-mt-playwright-ci > /dev/null <<'APT'
Acquire::Retries "1";
Acquire::http::Timeout "20";
Acquire::https::Timeout "20";
APT::Update::Error-Mode "any";
APT

retry() {
  local label="$1"
  shift
  local attempt
  for attempt in 1 2 3; do
    if "$@"; then
      return 0
    fi
    if [ "$attempt" -eq 3 ]; then
      echo "::error::$label failed after $attempt attempts." >&2
      return 1
    fi
    echo "::warning::$label failed (attempt $attempt/3). Retrying in $((attempt * 10))s..." >&2
    sleep "$((attempt * 10))"
  done
}

# Retry the two phases independently so a browser download failure does not
# repeat apt installation. Use the Playwright version installed by npm ci.
retry "Chromium system dependencies" npx --no-install playwright install-deps chromium
retry "Chromium download" npx --no-install playwright install chromium
