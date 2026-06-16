/**
 * PM2 Ecosystem Configuration for GeniLink Platform
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 stop genilink-platform
 *   pm2 restart genilink-platform
 *   pm2 logs genilink-platform
 *   pm2 monit
 *
 * Save current process list:
 *   pm2 save
 *
 * Startup script:
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'genilink-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: '/opt/genilink-platform/frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Use custom dist dir to avoid permission issues
        NEXT_DIST_DIR: '.next-runtime',
        // Billing disabled for testing
        BILLING_DISABLED: 'true',
        // Remote visibility service
        VISIBILITY_SERVICE_URL: 'http://127.0.0.1:8000',
        // Production URLs
        NEXT_PUBLIC_APP_URL: 'https://genilink.cn',
        AUTH_URL: 'https://genilink.cn',
      },
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      error_file: '/var/log/genilink/frontend-error.log',
      out_file: '/var/log/genilink/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      log_file: '/var/log/genilink/frontend-combined.log',
    },
    {
      name: 'genilink-content',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 4002',
      cwd: '/opt/genilink-platform/content',
      env: {
        NODE_ENV: 'production',
        PORT: 4002,
        // ContentOS JWT config
        NO_PROXY: 'localhost,127.0.0.1',
        // Production URLs
        NEXT_PUBLIC_APP_URL: 'https://genilink.cn',
        AUTH_URL: 'https://genilink.cn',
        // Database (use the shared RDS instance; fill in the production password in server env)
        DATABASE_URL: 'postgresql://genilink:CHANGE_THIS_PASSWORD@pgm-2zet5egdri6ubm411o.pg.rds.aliyuncs.com:5432/genilink?connection_limit=15&pool_timeout=10',
        // Service URLs
        CONTENT_SERVICE_URL: 'https://genilink.cn/api/content',
        VISIBILITY_SERVICE_URL: 'http://127.0.0.1:8000',
      },
      instances: 1,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      min_uptime: '10s',
      error_file: '/var/log/genilink/content-error.log',
      out_file: '/var/log/genilink/content-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      log_file: '/var/log/genilink/content-combined.log',
    },
  ],
};
