#!/usr/bin/env bash
set -euo pipefail

# Match the browsers to npm ci's locked test dependency. The Noble image and
# Ubuntu runner share the same platform for the installed native npm modules.
playwright_version="$(node -p "require('@playwright/test/package.json').version")"
if [[ ! "$playwright_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "::error::Cannot determine a stable installed Playwright version." >&2
  exit 1
fi
image="mcr.microsoft.com/playwright:v${playwright_version}-noble"

# Pulling a ready-made browser image avoids installing Ubuntu packages on the
# runner. Retry only image delivery; failed tests must never be retried here.
for attempt in 1 2 3; do
  if timeout 180s docker pull "$image"; then
    break
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "::error::Playwright image pull failed after $attempt attempts." >&2
    exit 1
  fi
  echo "::warning::Playwright image pull failed (attempt $attempt/3). Retrying in $((attempt * 10))s..." >&2
  sleep "$((attempt * 10))"
done

# Run the image that was actually pulled, without another registry lookup.
image_id="$(docker image inspect "$image" --format '{{.Id}}')"
if [[ ! "$image_id" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "::error::Cannot determine the pulled Playwright image ID." >&2
  exit 1
fi

docker run --rm --init --ipc=host \
  --mount "type=bind,source=$(pwd -P),target=/workspace" \
  --workdir /workspace \
  --env CI=true \
  "$image_id" npm run test:e2e
