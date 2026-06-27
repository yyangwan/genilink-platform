#!/bin/bash
#
# GeniLink Platform - Deploy Script
#
# This script deploys the latest code to production and restarts services.
#
# Usage:
#   ./deploy.sh              # Deploy from local machine to remote server
#   ./deploy.sh local        # Deploy on the server directly
#

set -euo pipefail

# Configuration
SERVER="root@8.147.56.119"
DOMAIN="genilink.cn"
FRONTEND_DIR="/opt/genilink-platform"
CONTENT_DIR="/opt/genilink-platform/content"
FRONTEND_CONTENT_SERVICE_URL="${FRONTEND_CONTENT_SERVICE_URL:-http://127.0.0.1:4002}"
VISIBILITY_ROOT="/opt/geo-visibility-analyze"
VISIBILITY_COMPOSE_BIN="${VISIBILITY_COMPOSE_BIN:-/usr/local/bin/docker-compose}"
VISIBILITY_DEEPSEEK_GATEWAY_BASE_URL="${VISIBILITY_DEEPSEEK_GATEWAY_BASE_URL:-http://llm-deepseek.internal.dns:8081}"
VISIBILITY_DEEPSEEK_GATEWAY_API_KEY="${VISIBILITY_DEEPSEEK_GATEWAY_API_KEY:-deepseek}"
VISIBILITY_DEEPSEEK_GATEWAY_MODEL="${VISIBILITY_DEEPSEEK_GATEWAY_MODEL:-deepseek-v4-flash}"
VISIBILITY_ANALYSIS_LLM_API_KEY="${VISIBILITY_ANALYSIS_LLM_API_KEY:-deepseek}"
VISIBILITY_ANALYSIS_LLM_BASE_URL="${VISIBILITY_ANALYSIS_LLM_BASE_URL:-http://llm-deepseek.internal.dns:8081}"
VISIBILITY_ANALYSIS_LLM_MODEL="${VISIBILITY_ANALYSIS_LLM_MODEL:-deepseek-v4-flash}"
CONTENT_BRIEF_LLM_API_KEY="${CONTENT_BRIEF_LLM_API_KEY:-$VISIBILITY_ANALYSIS_LLM_API_KEY}"
CONTENT_BRIEF_LLM_BASE_URL="${CONTENT_BRIEF_LLM_BASE_URL:-http://127.0.0.1:8081}"
CONTENT_BRIEF_LLM_MODEL="${CONTENT_BRIEF_LLM_MODEL:-$VISIBILITY_ANALYSIS_LLM_MODEL}"
LOCAL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

configure_visibility_deepseek_gateway() {
    log_info "Configuring visibility DeepSeek gateway mode..."

    ssh "$SERVER" <<ENDSSH
        set -euo pipefail

        cd "$VISIBILITY_ROOT"

        cat <<'PY' | "$VISIBILITY_COMPOSE_BIN" -f docker-compose.yml -f docker-compose.prod.yml exec -T backend python -
import asyncio
import json

from app.database import async_session
from app.services.platform_config_service import get_platform_config, set_platform_config

CONFIG = {
    "capture_mode": "gateway_search",
    "search": {
        "enable_search": True,
        "search_options": {"forced_search": True},
    },
    "gateway": {
        "base_url": "$VISIBILITY_DEEPSEEK_GATEWAY_BASE_URL",
        "api_key": "$VISIBILITY_DEEPSEEK_GATEWAY_API_KEY",
        "model": "$VISIBILITY_DEEPSEEK_GATEWAY_MODEL",
    },
    "request": {
        "temperature": 0.3,
        "max_tokens": None,
    },
    "parsing": {
        "citation_format": "markdown",
    },
}


async def main() -> None:
    async with async_session() as db:
        await set_platform_config(db, "deepseek", CONFIG)
        await db.commit()
        loaded = await get_platform_config(db, "deepseek")
        print(json.dumps(loaded, ensure_ascii=False, sort_keys=True, indent=2))


asyncio.run(main())
PY
ENDSSH
}

configure_visibility_analysis_llm() {
    if [ -z "$VISIBILITY_ANALYSIS_LLM_API_KEY" ]; then
        log_warn "VISIBILITY_ANALYSIS_LLM_API_KEY is empty; skipping visibility analysis LLM configuration"
        return 0
    fi

    log_info "Configuring visibility analysis LLM..."

    ssh "$SERVER" <<ENDSSH
        set -euo pipefail

        cd "$VISIBILITY_ROOT"

        python3 - <<'PY'
from pathlib import Path
import json

env_path = Path(".env")
updates = {
    "LLM_API_KEY": ${VISIBILITY_ANALYSIS_LLM_API_KEY@Q},
    "LLM_BASE_URL": ${VISIBILITY_ANALYSIS_LLM_BASE_URL@Q},
    "LLM_MODEL": ${VISIBILITY_ANALYSIS_LLM_MODEL@Q},
}

lines = env_path.read_text(encoding="utf-8").splitlines()
output = []
seen = set()

for line in lines:
    stripped = line.lstrip()
    if stripped.startswith("#") or "=" not in line:
        output.append(line)
        continue
    key, _ = line.split("=", 1)
    if key in updates:
        output.append(f"{key}={json.dumps(updates[key])}")
        seen.add(key)
    else:
        output.append(line)

for key, value in updates.items():
    if key not in seen:
        output.append(f"{key}={json.dumps(value)}")

env_path.write_text("\n".join(output) + "\n", encoding="utf-8")
PY

        "$VISIBILITY_COMPOSE_BIN" -f docker-compose.yml -f docker-compose.prod.yml up -d backend
        "$VISIBILITY_COMPOSE_BIN" -f docker-compose.yml -f docker-compose.prod.yml ps backend
ENDSSH
}

configure_frontend_content_brief_llm() {
    if [ -z "$CONTENT_BRIEF_LLM_API_KEY" ]; then
        log_warn "CONTENT_BRIEF_LLM_API_KEY is empty; skipping content brief LLM configuration"
        return 0
    fi

    log_info "Configuring frontend content brief LLM..."

    ssh "$SERVER" <<ENDSSH
        set -euo pipefail

        cd "$FRONTEND_DIR"

        python3 - <<'PY'
from pathlib import Path
import json

env_path = Path(".env")
updates = {
    "CONTENT_SERVICE_URL": ${FRONTEND_CONTENT_SERVICE_URL@Q},
    "CONTENT_BRIEF_LLM_API_KEY": ${CONTENT_BRIEF_LLM_API_KEY@Q},
    "CONTENT_BRIEF_LLM_BASE_URL": ${CONTENT_BRIEF_LLM_BASE_URL@Q},
    "CONTENT_BRIEF_LLM_MODEL": ${CONTENT_BRIEF_LLM_MODEL@Q},
}

lines = env_path.read_text(encoding="utf-8").splitlines() if env_path.exists() else []
output = []
seen = set()

for line in lines:
    stripped = line.lstrip()
    if stripped.startswith("#") or "=" not in line:
        output.append(line)
        continue
    key, _ = line.split("=", 1)
    if key in updates:
        output.append(f"{key}={json.dumps(updates[key])}")
        seen.add(key)
    else:
        output.append(line)

for key, value in updates.items():
    if key not in seen:
        output.append(f"{key}={json.dumps(value)}")

env_path.write_text("\n".join(output) + "\n", encoding="utf-8")
PY
ENDSSH
}

# Check if we're deploying locally or remotely
if [ "${1:-}" = "local" ]; then
    # Local deployment (running on the server itself)
    log_info "Starting local deployment..."

    # Build frontend
    log_info "Building frontend..."
    cd "$FRONTEND_DIR"
    npm ci --production=false
    NODE_OPTIONS="--max-old-space-size=4096" npm run build

    # Build content
    log_info "Building content..."
    cd "$CONTENT_DIR"
    npm ci --production=false
    NODE_OPTIONS="--max-old-space-size=4096" npm run build

    configure_frontend_content_brief_llm

    # Restart services
    log_info "Restarting services..."
    cd "$FRONTEND_DIR"
    pm2 restart genilink-frontend
    pm2 restart genilink-content

    configure_visibility_deepseek_gateway
    configure_visibility_analysis_llm

    log_info "Deployment completed!"
    pm2 status

else
    # Remote deployment (from local machine to server)
    log_info "Starting deployment to $SERVER..."

    # Check SSH connection
    if ! ssh -o ConnectTimeout=5 "$SERVER" "echo 'Connected'" 2>/dev/null; then
        echo "Error: Cannot connect to $SERVER"
        exit 1
    fi

    # Sync frontend code
    log_info "Syncing frontend code..."
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.next' \
        --exclude '.next-runtime' \
        --exclude '.git' \
        --exclude 'qa-artifacts' \
        --exclude 'test-results' \
        --exclude '.run-logs' \
        --exclude '*.zip' \
        "$LOCAL_ROOT/" "$SERVER:$FRONTEND_DIR/"

    # Sync content code
    log_info "Syncing content code..."
    CONTENT_LOCAL_ROOT="${CONTENT_ROOT:-$LOCAL_ROOT/../marketing}"
    if [ -d "$CONTENT_LOCAL_ROOT" ]; then
        rsync -avz --delete \
            --exclude 'node_modules' \
            --exclude '.next' \
            --exclude '.git' \
            "$CONTENT_LOCAL_ROOT/" "$SERVER:$CONTENT_DIR/"
    else
        log_warn "Content directory not found: $CONTENT_LOCAL_ROOT"
    fi

    configure_frontend_content_brief_llm

    # Build and restart on remote server
    log_info "Building and restarting services on remote server..."
    ssh "$SERVER" <<'ENDSSH'
        set -euo pipefail

        FRONTEND_DIR="/opt/genilink-platform"
        CONTENT_DIR="/opt/genilink-platform/content"

        echo "Building frontend..."
        cd "$FRONTEND_DIR"
        npm ci --production=false
        NODE_OPTIONS="--max-old-space-size=4096" npm run build

        echo "Building content..."
        cd "$CONTENT_DIR"
        npm ci --production=false
        NODE_OPTIONS="--max-old-space-size=4096" npm run build

        echo "Restarting services..."
        cd "$FRONTEND_DIR"
        pm2 restart genilink-frontend
        pm2 restart genilink-content

        echo "Deployment completed!"
        pm2 status
ENDSSH

    configure_visibility_deepseek_gateway
    configure_visibility_analysis_llm

    log_info "Deployment completed successfully!"
    echo ""
    echo "Access URLs:"
    echo "  Frontend: https://$DOMAIN"
    echo "  Status:   ssh $SERVER 'pm2 status'"
fi
