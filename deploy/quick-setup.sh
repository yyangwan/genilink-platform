#!/bin/bash
#
# GeniLink Platform - Quick Server Setup
# One-command setup for 8.147.56.119
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/.../quick-setup.sh | bash
#   or
#   wget -qO- https://raw.githubusercontent.com/.../quick-setup.sh | bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root (sudo)"
    exit 1
fi

log_info "=== GeniLink Platform Quick Setup ==="
echo ""

# 1. Install Node.js if not present
if ! command -v node &> /dev/null; then
    log_info "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    log_info "Node.js already installed: $(node -v)"
fi

# 2. Install PM2
if ! command -v pm2 &> /dev/null; then
    log_info "Installing PM2..."
    npm install -g pm2
    pm2 install pm2-logrotate
else
    log_info "PM2 already installed"
fi

# 3. Create directories
log_info "Creating directories..."
mkdir -p /opt/genilink-platform/frontend
mkdir -p /opt/genilink-platform/content
mkdir -p /var/log/genilink
mkdir -p /var/www/certbot

# 4. Setup log rotation
log_info "Setting up log rotation..."
cat > /etc/logrotate.d/genilink <<'EOF'
/var/log/genilink/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

# 5. Install Certbot
if ! command -v certbot &> /dev/null; then
    log_info "Installing Certbot..."
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
else
    log_info "Certbot already installed"
fi

# 6. Create genilink user (optional, for systemd services)
if ! id genilink &> /dev/null; then
    log_info "Creating genilink user..."
    useradd -r -s /bin/bash -d /opt/genilink-platform genilink
else
    log_info "genilink user already exists"
fi

# 7. Setup firewall (optional)
if command -v ufw &> /dev/null; then
    log_info "Configuring firewall..."
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
fi

# 8. Generate AUTH_SECRET
log_info "Generating AUTH_SECRET..."
AUTH_SECRET=$(openssl rand -base64 32)
log_info "AUTH_SECRET: $AUTH_SECRET"
log_warn "Please save this secret for .env.local configuration"

# 9. Show next steps
echo ""
log_info "=== Setup Completed ==="
echo ""
echo "Next steps:"
echo "  1. Deploy application code to /opt/genilink-platform/"
echo "  2. Copy ecosystem.config.js to /opt/genilink-platform/frontend/"
echo "  3. Configure .env.local with the following:"
echo "     AUTH_SECRET=$AUTH_SECRET"
echo "  4. Setup Nginx (see nginx-genilink.conf)"
echo "  5. Get SSL certificate:"
echo "     certbot certonly --webroot -w /var/www/certbot -d genilink.cn -d www.genilink.cn"
echo "  6. Start services:"
echo "     pm2 start /opt/genilink-platform/frontend/ecosystem.config.js"
echo "     pm2 save"
echo ""
