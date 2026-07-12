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
        BILLING_DISABLED: 'false',
        VISIBILITY_SERVICE_URL: 'http://127.0.0.1:8000',
        CONTENT_SERVICE_URL: 'http://127.0.0.1:4002',
        CONTENT_BRIEF_LLM_API_KEY: 'deepseek',
        CONTENT_BRIEF_LLM_BASE_URL: 'http://127.0.0.1:8081',
        CONTENT_BRIEF_LLM_MODEL: 'deepseek-v4-flash',
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
