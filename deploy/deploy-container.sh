#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/genilink-platform}"
ENV_FILE="${ENV_FILE:-$APP_ROOT/.env}"
KEYS_DIR="${KEYS_DIR:-$APP_ROOT/.keys}"
STATE_DIR="${STATE_DIR:-/opt/genilink-deploy}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-enabled/genilink.conf}"
UPSTREAM_FILE="${UPSTREAM_FILE:-/etc/nginx/conf.d/genilink-frontend-upstream.inc}"
PUBLIC_HEALTH_URL="${PUBLIC_HEALTH_URL:-https://genilink.cn/api/health}"
IMAGE_PREFIX="${IMAGE_PREFIX:-ghcr.io/yyangwan/genilink-platform:}"
HEALTH_ATTEMPTS="${HEALTH_ATTEMPTS:-45}"

BLUE_PORT=3002
GREEN_PORT=3003

log() {
  printf '[genilink-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

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
    local backup="${NGINX_SITE}.pre-container.$(date +%Y%m%d%H%M%S)"
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
  if ! curl --fail --silent --show-error --max-time 10 "$PUBLIC_HEALTH_URL" >/dev/null; then
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

  bootstrap_nginx

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

  log "pulling $image"
  docker pull "$image"

  if docker container inspect "$target_container" >/dev/null 2>&1; then
    docker rm -f "$target_container" >/dev/null
  fi

  local docker_args=(
    run -d
    --name "$target_container"
    --network host
    --restart unless-stopped
    --env-file "$ENV_FILE"
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
  if ! switch_upstream "$target_port"; then
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
  switch_upstream "$previous_port"
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
