#!/bin/bash
#
# GeniLink Platform - Server Setup Script
# Server: 8.147.56.119
#
# This script sets up the production environment:
# - Installs Node.js, PM2, and dependencies
# - Configures Nginx reverse proxy
# - Sets up SSL certificates (Let's Encrypt)
# - Deploys and starts services with PM2
#
# Usage:
#   sudo ./setup-server.sh
#   or
#   sudo bash setup-server.sh

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="genilink.cn"
FRONTEND_PORT=3001
CONTENT_PORT=4002
FRONTEND_DIR="/opt/genilink-platform"
CONTENT_DIR="/opt/genilink-platform/content"
LOG_DIR="/var/log/genilink"
DEPLOY_USER="${DEPLOY_USER:-root}"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run as root (sudo)"
        exit 1
    fi
}

install_pm2() {
    log_info "Installing PM2..."
    if ! command -v pm2 &> /dev/null; then
        npm install -g pm2
        pm2 install pm2-logrotate
        log_info "PM2 installed successfully"
    else
        log_info "PM2 already installed"
    fi
}

setup_directories() {
    log_info "Setting up directories..."

    # Create application directories
    mkdir -p "$FRONTEND_DIR"
    mkdir -p "$CONTENT_DIR"
    mkdir -p "$LOG_DIR"

    # Create log directory with proper permissions
    chown -R $DEPLOY_USER:$DEPLOY_USER "$LOG_DIR"
    chmod 755 "$LOG_DIR"

    # Create certbot directory for Let's Encrypt
    mkdir -p /var/www/certbot

    log_info "Directories created"
}

setup_nginx() {
    log_info "Setting up Nginx configuration..."

    # Copy nginx config
    cp nginx-genilink.conf /etc/nginx/sites-available/genilink.conf

    # Remove old symlink if exists
    rm -f /etc/nginx/sites-enabled/genilink.conf

    # Create new symlink
    ln -s /etc/nginx/sites-available/genilink.conf /etc/nginx/sites-enabled/

    # Remove default site if exists
    rm -f /etc/nginx/sites-enabled/default

    # Test nginx configuration
    nginx -t

    log_info "Nginx configured successfully"
}

setup_ssl() {
    log_info "Setting up SSL certificates..."

    # Check if certificates already exist
    if [ -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        log_warn "SSL certificates already exist for $DOMAIN"
        return
    fi

    # Install certbot if not present
    if ! command -v certbot &> /dev/null; then
        apt-get update
        apt-get install -y certbot python3-certbot-nginx
    fi

    # Get certificate
    certbot certonly --webroot \
        -w /var/www/certbot \
        -d $DOMAIN \
        -d www.$DOMAIN \
        --agree-tos \
        --email admin@$DOMAIN \
        --non-interactive

    log_info "SSL certificates obtained"
}

build_frontend() {
    log_info "Building Frontend..."

    cd "$FRONTEND_DIR"

    # Install dependencies
    npm ci --production=false

    # Build the application
    NODE_OPTIONS="--max-old-space-size=4096" npm run build

    log_info "Frontend built successfully"
}

build_content() {
    log_info "Building ContentOS..."

    cd "$CONTENT_DIR"

    # Install dependencies
    npm ci --production=false

    # Build the application
    NODE_OPTIONS="--max-old-space-size=4096" npm run build

    log_info "ContentOS built successfully"
}

setup_pm2_services() {
    log_info "Setting up PM2 services..."

    # Copy ecosystem config
    cp ecosystem.config.js "$FRONTEND_DIR/"

    cd "$FRONTEND_DIR"

    # Start services with PM2
    pm2 startOrRestart ecosystem.config.js --env production

    # Save PM2 configuration
    pm2 save

    # Setup PM2 startup script
    pm2 startup systemd -u $DEPLOY_USER --hp /home/$DEPLOY_USER

    log_info "PM2 services configured"
}

create_health_check() {
    log_info "Creating health check script..."

    cat > /usr/local/bin/genilink-health.sh <<'EOF'
#!/bin/bash
# GeniLink Platform Health Check

check_port() {
    local port=$1
    local name=$2
    if nc -z localhost $port 2>/dev/null; then
        echo "✓ $name is running (port $port)"
        return 0
    else
        echo "✗ $name is DOWN (port $port)"
        return 1
    fi
}

failed=0

check_port 3001 "Frontend" || failed=1
check_port 4002 "ContentOS" || failed=1

if [ $failed -eq 0 ]; then
    echo "All services are healthy"
    exit 0
else
    echo "Some services are down"
    exit 1
fi
EOF

    chmod +x /usr/local/bin/genilink-health.sh

    log_info "Health check script created"
}

show_status() {
    log_info "Deployment Status:"
    echo ""
    echo "Services:"
    pm2 status
    echo ""
    echo "Health Check:"
    /usr/local/bin/genilink-health.sh
    echo ""
    echo "Access URLs:"
    echo "  Frontend: https://$DOMAIN"
    echo "  Content API: https://$DOMAIN/api/content"
    echo "  Health: https://$DOMAIN/health"
}

# Main execution
main() {
    log_info "Starting GeniLink Platform setup..."
    echo ""

    check_root
    install_pm2
    setup_directories

    # Note: Builds require source code to be deployed first
    log_warn "Skipping builds - source code must be deployed first"
    # build_frontend
    # build_content

    setup_nginx
    setup_ssl
    setup_pm2_services
    create_health_check

    # Restart Nginx
    systemctl reload nginx

    echo ""
    log_info "Setup completed!"
    echo ""
    show_status
}

main "$@"
