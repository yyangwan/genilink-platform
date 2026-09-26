#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

export DEPLOY_CONTAINER_LIB_ONLY=1
export PATH="$TEMP_DIR/bin:$PATH"
mkdir -p "$TEMP_DIR/bin"

cat >"$TEMP_DIR/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '%s' "${FAKE_CURL_RESPONSE:-}"
EOF
chmod +x "$TEMP_DIR/bin/curl"

# shellcheck source=deploy-container.sh
source "$SCRIPT_DIR/deploy-container.sh"
RUNTIME_ENV_FILE="$TEMP_DIR/runtime.env"

cat >"$RUNTIME_ENV_FILE" <<'EOF'
ACQUISITION_ENABLED=false
VISIBILITY_SERVICE_URL=https://visibility.example.com
EOF
FAKE_CURL_RESPONSE=''
export FAKE_CURL_RESPONSE
verify_marketing_upstream_contract

cat >"$RUNTIME_ENV_FILE" <<'EOF'
ACQUISITION_ENABLED=true
VISIBILITY_SERVICE_URL=https://visibility.example.com
EOF
FAKE_CURL_RESPONSE='{"status":"ok","capabilities":["product_website_idempotency_v1"]}'
export FAKE_CURL_RESPONSE
verify_marketing_upstream_contract

FAKE_CURL_RESPONSE='{"status":"ok","capabilities":[]}'
export FAKE_CURL_RESPONSE
if (verify_marketing_upstream_contract) >/dev/null 2>&1; then
  printf 'missing upstream capability unexpectedly passed validation\n' >&2
  exit 1
fi

printf 'marketing upstream contract tests passed\n'
