#!/usr/bin/env bash
set -Eeuo pipefail

fail() {
  printf '[genilink-env] ERROR: %s\n' "$*" >&2
  exit 1
}

[ "$#" -eq 2 ] || fail "usage: $0 <dotenv-input> <docker-env-output>"

INPUT_FILE="$1"
OUTPUT_FILE="$2"
[ -f "$INPUT_FILE" ] || fail "runtime env file not found: $INPUT_FILE"

umask 077
TEMP_FILE="${OUTPUT_FILE}.tmp.$$"
trap 'rm -f "$TEMP_FILE"' EXIT

# Docker's --env-file keeps surrounding quotes as literal characters, while
# dotenv readers remove them. Normalize the outer quotes before docker run so
# the same server-owned file has the same meaning in both runtimes.
awk '
  function trim(value) {
    sub(/^[[:space:]]+/, "", value)
    sub(/[[:space:]]+$/, "", value)
    return value
  }

  {
    sub(/\r$/, "")
  }

  /^[[:space:]]*($|#)/ {
    print
    next
  }

  {
    line = $0
    sub(/^[[:space:]]*export[[:space:]]+/, "", line)
    separator = index(line, "=")
    if (separator == 0) {
      printf "invalid environment entry on line %d\n", NR > "/dev/stderr"
      exit 1
    }

    key = trim(substr(line, 1, separator - 1))
    value = trim(substr(line, separator + 1))
    if (key !~ /^[A-Za-z_][A-Za-z0-9_]*$/) {
      printf "invalid environment key on line %d\n", NR > "/dev/stderr"
      exit 1
    }

    if (length(value) > 0 && (substr(value, 1, 1) == "\"" || substr(value, 1, 1) == "\047")) {
      quote = substr(value, 1, 1)
      if (length(value) < 2 || substr(value, length(value), 1) != quote) {
        printf "unmatched quote for %s on line %d\n", key, NR > "/dev/stderr"
        exit 1
      }
      value = substr(value, 2, length(value) - 2)
    }

    print key "=" value
  }
' "$INPUT_FILE" >"$TEMP_FILE" || fail "could not normalize runtime env file"

chmod 600 "$TEMP_FILE"
mv "$TEMP_FILE" "$OUTPUT_FILE"
trap - EXIT

env_value() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { value = substr($0, index($0, "=") + 1) } END { print value }' "$OUTPUT_FILE"
}

require_env() {
  local key="$1"
  [ -n "$(env_value "$key")" ] || fail "required configuration is missing: $key"
}

require_secret() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  [ -n "$value" ] || fail "required configuration is missing: $key"
  [ "${#value}" -ge 32 ] || fail "$key must contain at least 32 characters"
}

feature_enabled() {
  [ "$(env_value "$1")" = "true" ]
}

validate_feature_flag() {
  local key="$1"
  case "$(env_value "$key")" in
    true|false) ;;
    *) fail "$key must be explicitly set to true or false" ;;
  esac
}

require_https_url_if_set() {
  local key="$1"
  local value
  value="$(env_value "$key")"
  if [ -n "$value" ]; then
    case "$value" in
      https://*) ;;
      *) fail "$key must use https" ;;
    esac
  fi
}

validate_contact_encryption_key() {
  local value bytes
  value="$(env_value MARKETING_CONTACT_ENCRYPTION_KEY)"
  [ -n "$value" ] || fail "required configuration is missing: MARKETING_CONTACT_ENCRYPTION_KEY"
  bytes="$(printf '%s' "$value" | base64 --decode 2>/dev/null | wc -c | tr -d '[:space:]')" \
    || fail "MARKETING_CONTACT_ENCRYPTION_KEY must be valid base64"
  [ "$bytes" = "32" ] || fail "MARKETING_CONTACT_ENCRYPTION_KEY must decode to exactly 32 bytes"
}

SMS_PROVIDER_VALUE="$(env_value SMS_PROVIDER)"
[ -n "$SMS_PROVIDER_VALUE" ] || SMS_PROVIDER_VALUE="aliyun"
SMS_PROVIDER_VALUE="$(printf '%s' "$SMS_PROVIDER_VALUE" | tr '[:upper:]' '[:lower:]')"

case "$SMS_PROVIDER_VALUE" in
  aliyun)
    require_env ALIBABA_CLOUD_ACCESS_KEY_ID
    require_env ALIBABA_CLOUD_ACCESS_KEY_SECRET
    require_env ALIBABA_CLOUD_SMS_SIGN_NAME
    require_env ALIBABA_CLOUD_SMS_TEMPLATE_CODE
    ;;
  tencent)
    require_env TENCENTCLOUD_SECRET_ID
    require_env TENCENTCLOUD_SECRET_KEY
    require_env TENCENTCLOUD_SMS_SDK_APP_ID
    require_env TENCENTCLOUD_SMS_SIGN_NAME
    require_env TENCENTCLOUD_SMS_TEMPLATE_ID
    ;;
  *)
    fail "SMS_PROVIDER must be aliyun or tencent"
    ;;
esac

for flag in ACQUISITION_ENABLED LEAD_FORMS_ENABLED MARKETING_JOBS_ENABLED; do
  validate_feature_flag "$flag"
done

if feature_enabled ACQUISITION_ENABLED || feature_enabled LEAD_FORMS_ENABLED; then
  require_secret MARKETING_HMAC_SECRET
fi

if feature_enabled LEAD_FORMS_ENABLED; then
  validate_contact_encryption_key
  if [ -n "$(env_value MARKETING_CONTACT_HMAC_SECRET)" ]; then
    require_secret MARKETING_CONTACT_HMAC_SECRET
  fi
fi

if feature_enabled MARKETING_JOBS_ENABLED; then
  require_secret MARKETING_CRON_SECRET
fi

RETENTION_DAYS="$(env_value MARKETING_EVENT_RETENTION_DAYS)"
if [ -n "$RETENTION_DAYS" ]; then
  [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] \
    || fail "MARKETING_EVENT_RETENTION_DAYS must be an integer between 30 and 730"
  [ "$RETENTION_DAYS" -ge 30 ] && [ "$RETENTION_DAYS" -le 730 ] \
    || fail "MARKETING_EVENT_RETENTION_DAYS must be between 30 and 730"
fi

require_https_url_if_set SALES_LEAD_WEBHOOK_URL

