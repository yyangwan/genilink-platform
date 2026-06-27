#!/bin/bash
# Auto-setup script for GeniLink Platform on 8.147.56.119
SERVER="root@8.147.56.119"
PASSWORD="abcXYZ@0123"

# Create expect script for SSH with password
cat > /tmp/ssh-auto.exp <<'EOFEXP'
#!/usr/bin/expect -f
set timeout 60
set server [lindex $argv 0]
set password [lindex $argv 1]
set command [lindex $argv 2]

spawn ssh -o StrictHostKeyChecking=no $server "$command"
expect {
    "password:" {
        send "$password\r"
        expect eof
    }
    eof
}
EOFEXP

chmod +x /tmp/ssh-auto.exp

# Function to execute command on remote server
exec_remote() {
    /tmp/ssh-auto.exp "$SERVER" "$PASSWORD" "$1"
}

echo "=== Step 1: Installing Node.js 20.x ==="
exec_remote "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs"

echo ""
echo "=== Step 2: Verifying Node.js installation ==="
exec_remote "node -v && npm -v"

echo ""
echo "=== Step 3: Installing PM2 ==="
exec_remote "npm install -g pm2 && pm2 install pm2-logrotate"

echo ""
echo "=== Step 4: Creating directory structure ==="
exec_remote "mkdir -p /opt/genilink-platform && mkdir -p /opt/genilink-platform/content && mkdir -p /var/log/genilink && mkdir -p /var/www/certbot"

echo ""
echo "=== Step 5: Verifying installation ==="
exec_remote "which node && which pm2 && ls -la /opt/genilink-platform/"

echo ""
echo "=== Setup Complete ==="
