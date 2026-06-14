# GeniLink Platform - 部署配置

服务器: **8.147.56.119**
域名: **genilink.cn**

## 📁 配置文件说明

| 文件 | 说明 |
|------|------|
| `ecosystem.config.js` | PM2 进程管理配置 |
| `nginx-genilink.conf` | Nginx 反向代理配置 |
| `.env.production` | 生产环境变量模板 |
| `setup-server.sh` | 服务器初始化脚本 |
| `deploy.sh` | 部署脚本 |

## 🚀 快速开始

### 1. 安装 PM2

服务器上已安装 Nginx，需要安装 PM2：

```bash
# SSH 登录服务器
ssh root@8.147.56.119

# 安装 PM2
npm install -g pm2
pm2 install pm2-logrotate
```

### 2. 部署代码到服务器

在本地机器上运行：

```bash
# 确保 deploy.sh 有执行权限
chmod +x deploy/deploy.sh

# 执行部署
./deploy/deploy.sh
```

### 3. 配置 Nginx

在服务器上：

```bash
# 复制 Nginx 配置
cp deploy/nginx-genilink.conf /etc/nginx/sites-available/genilink.conf

# 启用站点
ln -s /etc/nginx/sites-available/genilink.conf /etc/nginx/sites-enabled/

# 测试配置
nginx -t

# 重载 Nginx
systemctl reload nginx
```

### 4. 配置 SSL 证书

```bash
# 安装 Certbot
apt-get install -y certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d genilink.cn -d www.genilink.cn
```

### 5. 启动服务

在服务器上：

```bash
# 复制 PM2 配置
cp deploy/ecosystem.config.js /opt/genilink-platform/frontend/

# 启动服务
cd /opt/genilink-platform/frontend
pm2 start ecosystem.config.js

# 保存配置
pm2 save

# 设置开机自启
pm2 startup
```

## 📊 服务管理

### PM2 命令

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs genilink-platform

# 重启服务
pm2 restart genilink-platform

# 停止服务
pm2 stop genilink-platform

# 监控
pm2 monit
```

### 健康检查

```bash
# 运行健康检查脚本
/usr/local/bin/genilink-health.sh

# 或手动检查端口
netstat -tlnp | grep -E '3001|4002'
```

## 🔧 环境变量

复制并修改生产环境配置：

```bash
# 在服务器上
cp deploy/.env.production /opt/genilink-platform/frontend/.env.local

# 编辑配置，更新敏感信息
nano /opt/genilink-platform/frontend/.env.local
```

**必须更新的配置：**
- `DATABASE_URL` - 数据库连接字符串
- `AUTH_SECRET` - NextAuth 密钥 (运行 `openssl rand -base64 32` 生成)
- `WECHAT_MP_*` - 微信公众号凭证
- `BILLING_DISABLED` - 生产环境应设为 `false`

## 🌐 服务架构

```
                    ┌─────────────────┐
                    │   Nginx (443)   │
                    │  genilink.cn    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Frontend    │   │   ContentOS   │   │   Visibility  │
│   (Next.js)   │   │   (Next.js)   │   │   (Remote)    │
│   Port: 3001  │   │   Port: 4002  │   │   genilink.cn │
└───────────────┘   └───────────────┘   └───────────────┘
        │                    │
        └────────┬───────────┘
                 ▼
        ┌──────────────────┐
        │   PostgreSQL     │
        │   Port: 5432     │
        └──────────────────┘
```

## 🔄 部署流程

1. 本地开发完成后，运行 `./deploy/deploy.sh`
2. 脚本会自动同步代码到服务器
3. 在服务器上执行构建
4. 重启 PM2 服务
5. 验证服务状态

## 📝 端口说明

| 服务 | 内部端口 | 外部访问 |
|------|----------|----------|
| Frontend | 3001 | https://genilink.cn |
| ContentOS | 4002 | https://genilink.cn/api/content/* |
| PostgreSQL | 5432 | 仅本地访问 |

## 🔍 故障排查

```bash
# 查看 PM2 日志
pm2 logs --lines 100

# 查看 Nginx 日志
tail -f /var/log/nginx/genilink-error.log

# 检查端口占用
netstat -tlnp | grep -E '3001|4002'

# 测试 API
curl https://genilink.cn/health
curl https://genilink.cn/api/content/health
```

## 📞 联系支持

如有问题，请联系运维团队。
