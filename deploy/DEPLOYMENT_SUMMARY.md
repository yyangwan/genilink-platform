# GeniLink Platform 部署配置总结

服务器: **8.147.56.119**
域名: **genilink.cn**
配置时间: **2026-06-14**

## ✅ 已完成的配置

### 1. 环境安装
- ✅ Node.js 20.20.2
- ✅ PM2 7.0.1 (with pm2-logrotate)
- ✅ Nginx 1.18.0

### 2. 目录结构
```
/opt/genilink-platform/     # 应用代码
├── frontend/               # 前端应用目录（空，暂未使用）
├── content/                # ContentOS 目录（空，暂未使用）
├── node_modules/           # 依赖包
├── .next/                  # 构建输出
├── ecosystem.config.js     # PM2 配置
└── ...                     # 其他源代码

/var/log/genilink/          # 日志目录
/var/www/certbot/           # SSL 证书验证目录
```

### 3. 服务配置

#### PM2 管理的应用
- **genilink-frontend**: 端口 3001，Next.js 前端
- **bazi-backend**: 端口 5000，其他服务（已存在）

#### Nginx 配置
- HTTP 反向代理: `http://genilink.cn` → `http://127.0.0.1:3001`
- 配置文件: `/etc/nginx/sites-available/genilink-http.conf`

## 🔗 访问地址

| 服务 | 公网地址 | 状态 |
|------|----------|------|
| Frontend | http://8.147.56.119/ | ✅ HTTP 200 |
| Frontend (域名) | http://genilink.cn/ | ⚠️ 需要DNS解析 |
| API | http://8.147.56.119/api/* | ✅ 可用 |

## ⚠️ 待完成的配置

### 1. SSL 证书（HTTPS）
- 当前状态: 证书获取失败（certbot Python 依赖问题）
- 解决方案:
  ```bash
  # 方案1: 修复 certbot
  pip install --upgrade urllib3 requests

  # 方案2: 使用 DNS 验证
  certbot certonly --manual --preferred-challenges dns -d genilink.cn

  # 方案3: 使用自签名证书（临时）
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/letsencrypt/live/genilink.cn/privkey.pem \
    -out /etc/letsencrypt/live/genilink.cn/fullchain.pem
  ```

### 2. DNS 解析
- 需要将 `genilink.cn` 和 `www.genilink.cn` 解析到 `8.147.56.119`

### 3. ContentOS 服务
- 当前状态: 未部署
- 需要单独部署 ContentOS 后端服务（端口 4002）

## 📋 常用管理命令

```bash
# SSH 登录
ssh root@8.147.56.119

# PM2 管理
pm2 status                 # 查看状态
pm2 logs genilink-frontend # 查看日志
pm2 restart genilink-frontend  # 重启
pm2 stop all              # 停止所有
pm2 start all             # 启动所有

# Nginx 管理
nginx -t                  # 测试配置
systemctl reload nginx    # 重载配置
systemctl restart nginx   # 重启

# 日志查看
tail -f /var/log/genilink/frontend-out.log
tail -f /var/log/nginx/genilink-error.log
```

## 📁 相关配置文件

本地文件位置 `E:\workspace\genilink-platform\deploy\`:
- `ecosystem-simple.config.js` - PM2 配置
- `nginx-http.conf` - Nginx HTTP 配置
- `nginx-genilink.conf` - Nginx HTTPS 配置（含SSL）
- `.env.production` - 生产环境变量模板

## 🔒 安全建议

1. 修改数据库密码（.env 中的 DATABASE_URL）
2. 生成新的 AUTH_SECRET
3. 配置防火墙规则（ufw）
4. 启用 HTTPS（获取 SSL 证书）
