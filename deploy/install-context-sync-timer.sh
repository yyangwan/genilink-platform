#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test "$(id -u)" -eq 0
test -x /usr/bin/node
test -f /opt/genilink-platform/.env
/usr/bin/node --env-file=/opt/genilink-platform/.env -e '
  const secret = process.env.VISIBILITY_CONTEXT_SYNC_SECRET || "";
  const origin = new URL(process.env.VISIBILITY_CONTEXT_SYNC_ORIGIN || "");
  if (secret.length < 32 || origin.protocol !== "https:" || origin.username || origin.password) process.exit(1);
'
systemd-analyze verify "$SCRIPT_DIR/genilink-context-sync.service" "$SCRIPT_DIR/genilink-context-sync.timer"
install -m 0644 "$SCRIPT_DIR/genilink-context-sync.service" /etc/systemd/system/genilink-context-sync.service
install -m 0644 "$SCRIPT_DIR/genilink-context-sync.timer" /etc/systemd/system/genilink-context-sync.timer
systemctl daemon-reload
systemctl enable --now genilink-context-sync.timer
systemctl is-active --quiet genilink-context-sync.timer
