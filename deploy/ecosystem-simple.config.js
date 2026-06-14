/**
 * PM2 Ecosystem Configuration for GeniLink Platform
 * Simplified for single directory deployment
 */
module.exports = {
  apps: [
    {
      name: 'genilink-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      cwd: '/opt/genilink-platform',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        BILLING_DISABLED: 'true',
        VISIBILITY_SERVICE_URL: 'https://genilink.cn/visibility',
        NEXT_PUBLIC_APP_URL: 'https://genilink.cn',
        AUTH_URL: 'https://genilink.cn',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      autorestart: true,
      error_file: '/var/log/genilink/frontend-error.log',
      out_file: '/var/log/genilink/frontend-out.log',
    },
  ],
};
