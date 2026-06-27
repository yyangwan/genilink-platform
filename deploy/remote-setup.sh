#!/bin/bash
# Remote setup commands - execute this on the server
# Save as /tmp/setup-on-server.sh and run: bash /tmp/setup-on-server.sh

set -euo pipefail

echo "=== GeniLink Platform Setup ==="
echo "Server: 8.147.56.119"
echo ""

# 1. Install Node.js 20.x
echo "[1/6] Installing Node.js 20.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo "  ✓ Node.js $(node -v) installed"
else
    echo "  ✓ Node.js already installed: $(node -v)"
fi

# 2. Install PM2
echo "[2/6] Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    pm2 install pm2-logrotate
    echo "  ✓ PM2 $(pm2 -v) installed"
else
    echo "  ✓ PM2 already installed: $(pm2 -v)"
fi

# 3. Create directories
echo "[3/6] Creating directories..."
mkdir -p /opt/genilink-platform
mkdir -p /opt/genilink-platform/content
mkdir -p /var/log/genilink
mkdir -p /var/www/certbot
echo "  ✓ Directories created"

# 4. Configure Nginx
echo "[4/6] Configuring Nginx..."
cat > /etc/nginx/sites-available/genilink.conf <<'EOF'
# Nginx configuration for GeniLink Platform
# Domain: genilink.cn

upstream genilink_frontend {
    server 127.0.0.1:3001;
    keepalive 64;
}

upstream genilink_content {
    server 127.0.0.1:4003;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name genilink.cn www.genilink.cn;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name genilink.cn www.genilink.cn;

    ssl_certificate /etc/letsencrypt/live/genilink.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/genilink.cn/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    client_max_body_size 10M;

    location /_next/static/ {
        proxy_pass http://genilink_frontend;
        add_header Cache-Control "public, immutable";
    }

    location /api/content/ {
        proxy_pass http://genilink_content;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    location /api/auth/ {
        proxy_pass http://genilink_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://genilink_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location / {
        proxy_pass http://genilink_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Remove old symlink
rm -f /etc/nginx/sites-enabled/genilink.conf
ln -s /etc/nginx/sites-available/genilink.conf /etc/nginx/sites-enabled/
nginx -t
echo "  ✓ Nginx configured"

# 5. Install Certbot
echo "[5/6] Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    apt-get update
    apt-get install -y certbot python3-certbot-nginx
    echo "  ✓ Certbot installed"
else
    echo "  ✓ Certbot already installed"
fi

# 6. Generate AUTH_SECRET
echo "[6/6] Generating AUTH_SECRET..."
AUTH_SECRET=$(openssl rand -base64 32)
echo "  AUTH_SECRET: $AUTH_SECRET"
echo "  Save this for .env.local configuration"

echo ""
echo "=== Setup Summary ==="
echo "Node.js: $(node -v)"
echo "PM2: $(pm2 -v)"
echo "Nginx: $(nginx -v 2>&1)"
echo ""
echo "Next steps:"
echo "1. Get SSL certificate: certbot certonly --webroot -w /var/www/certbot -d genilink.cn -d www.genilink.cn"
echo "2. Deploy application code to /opt/genilink-platform/"
echo "3. Configure .env.local with AUTH_SECRET"
echo "4. Start services with PM2"
