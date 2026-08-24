#!/usr/bin/env bash
set -euo pipefail

app_dir="${GENILINK_APP_DIR:-/opt/genilink-platform}"
env_file="${app_dir}/.env"
endpoint="${GENILINK_BILLING_CRON_URL:-http://127.0.0.1:3001/api/internal/billing/renewals/run}"

secret=$(sed -n 's/^BILLING_CRON_SECRET=//p' "$env_file" | tail -n 1)
secret=${secret#\"}
secret=${secret%\"}
if [[ -z "$secret" ]]; then
  echo "BILLING_CRON_SECRET is missing" >&2
  exit 1
fi

curl --fail --silent --show-error \
  --request POST \
  --header "Authorization: Bearer ${secret}" \
  "$endpoint"
