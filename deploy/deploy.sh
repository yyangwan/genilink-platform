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
FRONTEND_DIR="/opt/genilink-platform/frontend"
CONTENT_DIR="/opt/genilink-platform/content"
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

    # Restart services
    log_info "Restarting services..."
    cd "$FRONTEND_DIR"
    pm2 restart genilink-frontend
    pm2 restart genilink-content

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

    # Build and restart on remote server
    log_info "Building and restarting services on remote server..."
    ssh "$SERVER" <<'ENDSSH'
        set -euo pipefail

        FRONTEND_DIR="/opt/genilink-platform/frontend"
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

    log_info "Deployment completed successfully!"
    echo ""
    echo "Access URLs:"
    echo "  Frontend: https://$DOMAIN"
    echo "  Status:   ssh $SERVER 'pm2 status'"
fi
