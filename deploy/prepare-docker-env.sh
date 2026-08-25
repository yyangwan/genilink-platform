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
  [ -n "$(env_value "$key")" ] || fail "required SMS configuration is missing: $key"
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

