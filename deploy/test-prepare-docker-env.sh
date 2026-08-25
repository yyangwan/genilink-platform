#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

assert_line() {
  local expected="$1"
  local file="$2"
  grep -Fqx "$expected" "$file" || {
    printf 'expected line not found: %s\n' "$expected" >&2
    exit 1
  }
}

cat >"$TEMP_DIR/aliyun.env" <<'EOF'
# Server-owned dotenv file
SMS_PROVIDER="aliyun"
ALIBABA_CLOUD_ACCESS_KEY_ID='access-id'
ALIBABA_CLOUD_ACCESS_KEY_SECRET="secret=value"
ALIBABA_CLOUD_SMS_SIGN_NAME="智链"
ALIBABA_CLOUD_SMS_TEMPLATE_CODE="SMS_123456789"
AUTH_SECRET="hash#value"
EMPTY_VALUE=""
EOF

bash "$SCRIPT_DIR/prepare-docker-env.sh" \
  "$TEMP_DIR/aliyun.env" "$TEMP_DIR/docker.env"

assert_line 'SMS_PROVIDER=aliyun' "$TEMP_DIR/docker.env"
assert_line 'ALIBABA_CLOUD_ACCESS_KEY_ID=access-id' "$TEMP_DIR/docker.env"
assert_line 'ALIBABA_CLOUD_ACCESS_KEY_SECRET=secret=value' "$TEMP_DIR/docker.env"
assert_line 'ALIBABA_CLOUD_SMS_SIGN_NAME=智链' "$TEMP_DIR/docker.env"
assert_line 'AUTH_SECRET=hash#value' "$TEMP_DIR/docker.env"
assert_line 'EMPTY_VALUE=' "$TEMP_DIR/docker.env"

bash "$SCRIPT_DIR/prepare-docker-env.sh" \
  "$TEMP_DIR/aliyun.env" "$TEMP_DIR/docker.env"
if [[ "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* && "$(uname -s)" != CYGWIN* ]] && \
  [ "$(stat -c '%a' "$TEMP_DIR/docker.env")" != "600" ]; then
  printf 'normalized environment file permissions are not 600\n' >&2
  exit 1
fi

cat >"$TEMP_DIR/invalid-provider.env" <<'EOF'
SMS_PROVIDER="unknown"
EOF
if bash "$SCRIPT_DIR/prepare-docker-env.sh" \
  "$TEMP_DIR/invalid-provider.env" "$TEMP_DIR/invalid-provider.out" >/dev/null 2>&1; then
  printf 'invalid provider unexpectedly passed validation\n' >&2
  exit 1
fi

cat >"$TEMP_DIR/incomplete-aliyun.env" <<'EOF'
SMS_PROVIDER=aliyun
ALIBABA_CLOUD_ACCESS_KEY_ID=access-id
EOF
if bash "$SCRIPT_DIR/prepare-docker-env.sh" \
  "$TEMP_DIR/incomplete-aliyun.env" "$TEMP_DIR/incomplete-aliyun.out" >/dev/null 2>&1; then
  printf 'incomplete Aliyun configuration unexpectedly passed validation\n' >&2
  exit 1
fi

cat >"$TEMP_DIR/tencent.env" <<'EOF'
export SMS_PROVIDER="TENCENT"
TENCENTCLOUD_SECRET_ID="secret-id"
TENCENTCLOUD_SECRET_KEY="secret-key"
TENCENTCLOUD_SMS_SDK_APP_ID="1400000000"
TENCENTCLOUD_SMS_SIGN_NAME="智链"
TENCENTCLOUD_SMS_TEMPLATE_ID="123456"
EOF
bash "$SCRIPT_DIR/prepare-docker-env.sh" \
  "$TEMP_DIR/tencent.env" "$TEMP_DIR/tencent.out"
assert_line 'SMS_PROVIDER=TENCENT' "$TEMP_DIR/tencent.out"
assert_line 'TENCENTCLOUD_SMS_TEMPLATE_ID=123456' "$TEMP_DIR/tencent.out"

cat >"$TEMP_DIR/unmatched-quote.env" <<'EOF'
SMS_PROVIDER="aliyun
EOF
if bash "$SCRIPT_DIR/prepare-docker-env.sh" \
  "$TEMP_DIR/unmatched-quote.env" "$TEMP_DIR/unmatched-quote.out" >/dev/null 2>&1; then
  printf 'unmatched quote unexpectedly passed validation\n' >&2
  exit 1
fi

printf 'prepare-docker-env tests passed\n'
