#!/usr/bin/env bash
set -euo pipefail

app_dir="${GENILINK_APP_DIR:-/opt/genilink-platform}"
env_file="${app_dir}/.env"
state_dir="${GENILINK_DEPLOY_STATE_DIR:-/opt/genilink-deploy}"

if [[ -n "${GENILINK_BILLING_CRON_URL:-}" ]]; then
  endpoint="$GENILINK_BILLING_CRON_URL"
else
  active_slot_file="${state_dir}/active-slot"
  if [[ ! -r "$active_slot_file" ]]; then
    echo "active deployment slot is unavailable: ${active_slot_file}" >&2
    exit 1
  fi
  active_slot=$(tr -d '[:space:]' <"$active_slot_file")
  case "$active_slot" in
    blue) active_port=3002 ;;
    green) active_port=3003 ;;
    *)
      echo "active deployment slot is invalid: ${active_slot}" >&2
      exit 1
      ;;
  esac
  endpoint="http://127.0.0.1:${active_port}/api/internal/billing/renewals/run"
fi

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
