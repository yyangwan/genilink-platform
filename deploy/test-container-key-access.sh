#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_CONTAINER_LIB_ONLY=1
# shellcheck source=deploy-container.sh
source "$SCRIPT_DIR/deploy-container.sh"

[ "$FRONTEND_KEYS_GID" = "65533" ] || test_fail "runtime GID no longer matches the retained pre-fix image contract"

TEST_ROOT="$(mktemp -d)"
cleanup_test_root() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup_test_root EXIT

test_fail() {
  printf 'container key access test failed: %s\n' "$*" >&2
  exit 1
}

write_keys() {
  local directory="$1"
  mkdir -p "$directory"
  printf 'private-key-test-data\n' >"$directory/private.pem"
  printf 'public-key-test-data\n' >"$directory/public.pem"
}

expect_prepare_failure() {
  local directory="$1"
  local label="$2"
  if (KEYS_DIR="$directory"; prepare_key_permissions) >/dev/null 2>&1; then
    test_fail "$label unexpectedly succeeded"
  fi
}

valid_dir="$TEST_ROOT/valid"
write_keys "$valid_dir"
chmod 0777 "$valid_dir" "$valid_dir/private.pem" "$valid_dir/public.pem"
KEYS_DIR="$valid_dir"
prepare_key_permissions >/dev/null
[ "$(stat -c '%a' "$valid_dir")" = "750" ] || test_fail "directory mode was not normalized"
[ "$(stat -c '%a' "$valid_dir/private.pem")" = "640" ] || test_fail "private key mode was not normalized"
[ "$(stat -c '%a' "$valid_dir/public.pem")" = "640" ] || test_fail "public key mode was not normalized"
[ "$(stat -c '%g' "$valid_dir")" = "$FRONTEND_KEYS_GID" ] || test_fail "directory group was not normalized"
[ "$(stat -c '%g' "$valid_dir/private.pem")" = "$FRONTEND_KEYS_GID" ] || test_fail "private key group was not normalized"
[ "$(stat -c '%g' "$valid_dir/public.pem")" = "$FRONTEND_KEYS_GID" ] || test_fail "public key group was not normalized"

expect_prepare_failure "$TEST_ROOT/missing" "missing directory"

missing_key_dir="$TEST_ROOT/missing-key"
mkdir -p "$missing_key_dir"
printf 'private-key-test-data\n' >"$missing_key_dir/private.pem"
expect_prepare_failure "$missing_key_dir" "missing public key"

empty_key_dir="$TEST_ROOT/empty-key"
write_keys "$empty_key_dir"
: >"$empty_key_dir/private.pem"
expect_prepare_failure "$empty_key_dir" "empty private key"

symlink_target="$TEST_ROOT/symlink-target"
write_keys "$symlink_target"
ln -s "$symlink_target" "$TEST_ROOT/symlink-dir"
expect_prepare_failure "$TEST_ROOT/symlink-dir" "symlink directory"

symlink_key_dir="$TEST_ROOT/symlink-key"
mkdir -p "$symlink_key_dir"
printf 'private-key-test-data\n' >"$TEST_ROOT/private-target.pem"
ln -s "$TEST_ROOT/private-target.pem" "$symlink_key_dir/private.pem"
printf 'public-key-test-data\n' >"$symlink_key_dir/public.pem"
expect_prepare_failure "$symlink_key_dir" "symlink private key"

rollback_state="$TEST_ROOT/rollback-state"
mkdir -p "$rollback_state"
printf 'green\n' >"$rollback_state/previous-slot"
printf 'blue\n' >"$rollback_state/active-slot"
printf 'ghcr.io/yyangwan/genilink-platform:previous\n' >"$rollback_state/previous-image"
printf 'ghcr.io/yyangwan/genilink-platform:current\n' >"$rollback_state/active-image"
rollback_log="$TEST_ROOT/rollback.log"

verify_image_key_access() {
  printf 'verify:%s\n' "$1" >>"$rollback_log"
}
docker() {
  printf 'docker:%s\n' "$*" >>"$rollback_log"
}
wait_for_health() {
  return 0
}
switch_upstream() {
  printf 'switch:%s:%s\n' "$1" "$2" >>"$rollback_log"
}

STATE_DIR="$rollback_state"
rollback >/dev/null
[ "$(sed -n '1p' "$rollback_log")" = 'verify:ghcr.io/yyangwan/genilink-platform:previous' ] \
  || test_fail "rollback did not validate the previous image before starting it"
[ "$(sed -n '2p' "$rollback_log")" = 'docker:start genilink-frontend-green' ] \
  || test_fail "rollback started the previous container before key validation"

printf 'container key access tests passed\n'
