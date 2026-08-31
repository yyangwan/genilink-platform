#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/genilink-platform}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$APP_ROOT/.env}"
KEYS_DIR="${KEYS_DIR:-$APP_ROOT/.keys}"
STATE_DIR="${STATE_DIR:-/opt/genilink-deploy}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/genilink.conf}"
UPSTREAM_FILE="${UPSTREAM_FILE:-/etc/nginx/conf.d/genilink-frontend-upstream.inc}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://genilink.cn/api/health}"
IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/yyangwan/genilink-platform:}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-45}"
RUNTIME_ENV_FILE=""

BLUE_PORT=3002
GREEN_PORT=3003

log() {
  printf '[genilink-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

cleanup() {
  if [ -n "$RUNTIME_ENV_FILE" ]; then
    rm -f "$RUNTIME_ENV_FILE"
  fi
}

trap cleanup EXIT

require_root() {
  [ "$(id -u)" -eq 0 ] || fail "run as root"
}

port_for_slot() {
  case "$1" in
    blue) printf '%s' "$BLUE_PORT" ;;
    green) printf '%s' "$GREEN_PORT" ;;
    *) return 1 ;;
  esac
}

container_for_slot() {
  printf 'genilink-frontend-%s' "$1"
}

wait_for_health() {
  local port="$1"
  local attempt
  for ((attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt++)); do
    if curl --fail --silent --show-error --max-time 4 \
      "http://127.0.0.1:${port}/api/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

write_upstream() {
  local port="$1"
  local candidate="${UPSTREAM_FILE}.new"
  printf 'server 127.0.0.1:%s;\n' "$port" >"$candidate"
  mv "$candidate" "$UPSTREAM_FILE"
}

bootstrap_nginx() {
  [ -f "$NGINX_SITE" ] || fail "nginx site not found: $NGINX_SITE"

  if [ ! -f "$UPSTREAM_FILE" ]; then
    write_upstream 3001
  fi

  if grep -Fq 'server 127.0.0.1:3001;' "$NGINX_SITE"; then
    local nginx_backup_dir="$STATE_DIR/nginx-backups"
    mkdir -p "$nginx_backup_dir"
    local backup="$nginx_backup_dir/genilink.conf.pre-container.$(date +%Y%m%d%H%M%S)"
    cp "$NGINX_SITE" "$backup"
    sed -i \
      's|^[[:space:]]*server 127\.0\.0\.1:3001;[[:space:]]*$|    include /etc/nginx/conf.d/genilink-frontend-upstream.inc;|' \
      "$NGINX_SITE"
    sed -i \
      's|proxy_pass http://127\.0\.0\.1:3001/api/;|proxy_pass http://genilink_frontend/api/;|' \
      "$NGINX_SITE"
    if ! nginx -t; then
      cp "$backup" "$NGINX_SITE"
      nginx -t
      fail "nginx bootstrap validation failed; restored $backup"
    fi
    systemctl reload nginx
    log "nginx upstream bootstrapped; backup: $backup"
  fi

  grep -Fq 'include /etc/nginx/conf.d/genilink-frontend-upstream.inc;' "$NGINX_SITE" \
    || fail "nginx site is not connected to $UPSTREAM_FILE"
}

switch_upstream() {
  local port="$1"
  local expected_version="$2"
  local previous
  previous="$(cat "$UPSTREAM_FILE")"
  write_upstream "$port"

  if ! nginx -t; then
    printf '%s\n' "$previous" >"$UPSTREAM_FILE"
    nginx -t
    log "ERROR: nginx validation failed; restored previous upstream"
    return 1
  fi

  systemctl reload nginx
  local attempt
  local health_body
  local public_healthy=0
  for ((attempt = 1; attempt <= 15; attempt++)); do
    health_body="$(curl --fail --silent --max-time 10 \
      "${PUBLIC_HEALTH_URL}?deployment=${expected_version}" 2>/dev/null || true)"
    if printf '%s' "$health_body" \
      | grep -Fq "\"deployment\":\"${expected_version}\""; then
      public_healthy=1
      break
    fi
    sleep 2
  done
  if [ "$public_healthy" -ne 1 ]; then
    printf '%s\n' "$previous" >"$UPSTREAM_FILE"
    nginx -t
    systemctl reload nginx
    log "ERROR: public health check failed; restored previous upstream"
    return 1
  fi
}

deploy_image() {
  local image="$1"
  case "$image" in
    "$IMAGE_PREFIX"*) ;;
    *) fail "image must start with $IMAGE_PREFIX" ;;
  esac

  [ -f "$ENV_FILE" ] || fail "runtime env file not found: $ENV_FILE"
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/deploy.lock"
  flock -n 9 || fail "another deployment is running"

  RUNTIME_ENV_FILE="$(mktemp "$STATE_DIR/runtime-env.XXXXXX")"
  bash "$SCRIPT_DIR/prepare-docker-env.sh" "$ENV_FILE" "$RUNTIME_ENV_FILE"
  log "runtime configuration normalized and validated"

  local active_slot="legacy"
  if [ -f "$STATE_DIR/active-slot" ]; then
    active_slot="$(cat "$STATE_DIR/active-slot")"
  fi

  local target_slot="blue"
  [ "$active_slot" = "blue" ] && target_slot="green"
  local target_port
  target_port="$(port_for_slot "$target_slot")"
  local target_container
  target_container="$(container_for_slot "$target_slot")"

  if [ "${SKIP_IMAGE_PULL:-0}" = "1" ]; then
    docker image inspect "$image" >/dev/null 2>&1 \
      || fail "preloaded image not found: $image"
    log "using preloaded image $image"
  else
    log "pulling $image"
    docker pull "$image"
  fi

  log "applying verified database migrations"
  docker run --rm \
    --network host \
    --env-file "$RUNTIME_ENV_FILE" \
    "$image" \
    sh -c 'cd /prisma-runtime && node node_modules/prisma/build/index.js migrate deploy' \
    || fail "database migration failed; active release was not changed"

  bootstrap_nginx

  if docker container inspect "$target_container" >/dev/null 2>&1; then
    docker rm -f "$target_container" >/dev/null
  fi

  local docker_args=(
    run -d
    --name "$target_container"
    --network host
    --restart unless-stopped
    --env-file "$RUNTIME_ENV_FILE"
    --env "PORT=$target_port"
    --env "HOSTNAME=0.0.0.0"
    --env "DEPLOYMENT_VERSION=${image##*:}"
    --label "cn.genilink.role=frontend"
    --label "cn.genilink.slot=$target_slot"
  )
  if [ -d "$KEYS_DIR" ]; then
    docker_args+=(--volume "$KEYS_DIR:/app/.keys:ro")
  fi
  docker_args+=("$image")

  log "starting $target_container on port $target_port"
  docker "${docker_args[@]}" >/dev/null

  if ! wait_for_health "$target_port"; then
    docker logs --tail 100 "$target_container" >&2 || true
    docker rm -f "$target_container" >/dev/null || true
    fail "new container did not become healthy"
  fi

  log "switching nginx to $target_slot ($target_port)"
  if ! switch_upstream "$target_port" "${image##*:}"; then
    docker rm -f "$target_container" >/dev/null || true
    fail "nginx switch failed; new container removed"
  fi

  printf '%s\n' "$active_slot" >"$STATE_DIR/previous-slot"
  [ -f "$STATE_DIR/active-image" ] && cp "$STATE_DIR/active-image" "$STATE_DIR/previous-image"
  printf '%s\n' "$target_slot" >"$STATE_DIR/active-slot"
  printf '%s\n' "$image" >"$STATE_DIR/active-image"

  if [ "$active_slot" = "blue" ] || [ "$active_slot" = "green" ]; then
    docker stop --time 20 "$(container_for_slot "$active_slot")" >/dev/null || true
  fi

  docker image prune -f >/dev/null || true
  log "deployment complete: $image is live on $target_slot"
}

rollback() {
  mkdir -p "$STATE_DIR"
  exec 9>"$STATE_DIR/deploy.lock"
  flock -n 9 || fail "another deployment is running"

  [ -f "$STATE_DIR/previous-slot" ] || fail "no previous slot recorded"
  local previous_slot
  previous_slot="$(cat "$STATE_DIR/previous-slot")"
  case "$previous_slot" in
    blue|green) ;;
    *) fail "previous deployment was the legacy PM2 service; automatic rollback is unavailable" ;;
  esac

  local previous_container
  previous_container="$(container_for_slot "$previous_slot")"
  local previous_port
  previous_port="$(port_for_slot "$previous_slot")"
  docker start "$previous_container" >/dev/null
  wait_for_health "$previous_port" || fail "previous container did not become healthy"

  local current_slot
  current_slot="$(cat "$STATE_DIR/active-slot")"
  [ -f "$STATE_DIR/previous-image" ] || fail "no previous image recorded"
  local previous_image
  previous_image="$(cat "$STATE_DIR/previous-image")"
  switch_upstream "$previous_port" "${previous_image##*:}"
  docker stop --time 20 "$(container_for_slot "$current_slot")" >/dev/null || true

  printf '%s\n' "$current_slot" >"$STATE_DIR/previous-slot"
  printf '%s\n' "$previous_slot" >"$STATE_DIR/active-slot"
  if [ -f "$STATE_DIR/previous-image" ]; then
    local current_image
    current_image="$(cat "$STATE_DIR/active-image")"
    cp "$STATE_DIR/previous-image" "$STATE_DIR/active-image"
    printf '%s\n' "$current_image" >"$STATE_DIR/previous-image"
  fi
  log "rollback complete: $previous_slot is live"
}

require_root
case "${1:-}" in
  rollback) rollback ;;
  "") fail "usage: $0 <image-ref> | rollback" ;;
  *) deploy_image "$1" ;;
esac
