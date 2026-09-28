#!/usr/bin/env sh
set -eu

# Read Compose's effective input, including quoted .env values and shell overrides.
# An absent flag can be recovered from the persistent integration; an explicit
# false remains an intentional choice to use the cloud API.
compose_environment="$(docker compose config --environment)"
configured_mode="$(printf '%s\n' "$compose_environment" | sed -n 's/^TELEGRAM_LOCAL_MODE=//p')"
case "$configured_mode" in
  true|false) printf '%s\n' "$configured_mode"; exit 0 ;;
  '') ;;
  *) echo 'TELEGRAM_LOCAL_MODE must be true or false.' >&2; exit 1 ;;
esac

if [ -f .telegram-bot-api.env ] \
  && grep -Eq '^TELEGRAM_API_ID=[0-9]+$' .telegram-bot-api.env \
  && grep -Eq '^TELEGRAM_API_HASH=[a-fA-F0-9]{32}$' .telegram-bot-api.env; then
  printf 'true\n'
  exit 0
fi

# The database is already healthy when deployment invokes this script. Query
# presence only: never return API credentials to the deployment process/logs.
has_settings="$(docker compose exec -T db sh -c 'psql --no-psqlrc --set=ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align' <<'SQL'
SELECT to_regclass('public.integration_settings') IS NOT NULL;
SQL
)"
if [ "$has_settings" = 't' ]; then
  has_credentials="$(docker compose exec -T db sh -c 'psql --no-psqlrc --set=ON_ERROR_STOP=1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --tuples-only --no-align' <<'SQL'
SELECT EXISTS (
  SELECT 1 FROM public.integration_settings
  WHERE key = 'telegram_local_api'
    AND secret_ciphertext IS NOT NULL AND secret_ciphertext <> ''
    AND secret_iv IS NOT NULL AND secret_iv <> ''
    AND secret_tag IS NOT NULL AND secret_tag <> ''
);
SQL
)"
  if [ "$has_credentials" = 't' ]; then
    printf 'true\n'
    exit 0
  fi
fi

printf 'false\n'
