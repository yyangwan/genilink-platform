# GeniLink 运维手册

服务器: `8.147.56.119`
域名: `genilink.cn`
更新时间: `2026-06-14`

## 当前拓扑

| 组件 | 位置 | 地址/端口 | 管理方式 |
| --- | --- | --- | --- |
| 智链前台 | `/opt/genilink-platform/frontend` | `3001` | PM2 |
| 智创 / ContentOS | `/opt/genilink-platform/content` | `4002` | PM2 |
| Higress 网关 | `/opt/higress-standalone/compose` | `8080` / `8081` / `8443` / `8848` / `8888` / `15020` | systemd + `docker compose` |
| 智见 / Visibility | `root@8.147.56.119:/root/geo-visibility-analyze` | `http://127.0.0.1:8000` on host, exposed via `https://genilink.cn/visibility` | SSH + `docker compose` |

## 对外入口

| 入口 | 地址 |
| --- | --- |
| 主站 | `https://genilink.cn/` |
| 智见 | `https://genilink.cn/visibility` |
| 智创 API | `https://genilink.cn/api/content/` |
| Higress Console | `http://8.147.56.119:8080/` |
| Higress Gateway | `http://8.147.56.119:8081/` |
| Higress Gateway HTTPS | `https://8.147.56.119:8443/` |
| 健康检查 | `https://genilink.cn/health` |

## 这套仓库里有什么

| 文件 | 用途 |
| --- | --- |
| `deploy/deploy.sh` | 代码同步和重启脚本 |
| `deploy/setup-server.sh` | 服务器初始化脚本 |
| `deploy/quick-setup.sh` | 一键初始化提示脚本 |
| `deploy/ecosystem.config.js` | PM2 配置模板 |
| `deploy/nginx-http.conf` | 80 端口 Nginx 配置 |
| `deploy/nginx-genilink.conf` | HTTPS Nginx 配置 |
| `start-all.sh` | 本地工作区启动脚本 |
| `start-all.ps1` | Windows PowerShell 包装器 |

## 本地工作区启动

`start-all.sh` 用于当前仓库所在工作区，适合在本机做联调、回归和 E2E。

```bash
./start-all.sh
./start-all.sh status
./start-all.sh restart
./start-all.sh stop
./start-all.sh restart-visibility
./start-all.sh status-visibility
```

Windows 下使用：

```powershell
.\start-all.ps1
.\start-all.ps1 status
```

### 常用环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CONTENT_ROOT` | `../marketing` | 智创 / ContentOS 的源码目录 |
| `PLATFORM_ROOT` | 当前仓库 `deploy/..` | 智链前台源码目录 |
| `VISIBILITY_SERVICE_URL` | `http://127.0.0.1:8000` | 智见服务内网地址 |
| `VISIBILITY_REMOTE_SSH_TARGET` | `root@8.147.56.119` | 远端服务器 |
| `VISIBILITY_REMOTE_ROOT` | `/root/geo-visibility-analyze` | 远端智见代码目录 |
| `VISIBILITY_DEEPSEEK_GATEWAY_BASE_URL` | `http://llm-deepseek.internal.dns:8081` | DeepSeek 走 Higress 的网关入口 |
| `VISIBILITY_DEEPSEEK_GATEWAY_API_KEY` | `deepseek` | Higress DeepSeek 路由要求的 Authorization token |
| `VISIBILITY_DEEPSEEK_GATEWAY_MODEL` | `deepseek-v4-flash` | 走 Higress 时传给 DeepSeek 的模型名 |
| `HIGRESS_REMOTE_SSH_TARGET` | `root@8.147.56.119` | Higress 所在服务器 |
| `HIGRESS_REMOTE_ROOT` | `/opt/higress-standalone/compose` | Higress compose 目录 |
| `HIGRESS_REMOTE_COMPOSE_BIN` | `/usr/local/bin/docker-compose` | Higress compose 命令 |
| `START_ALL_LOG_DIR` | `./.run-logs` | 启动日志目录 |

如果 `CONTENT_ROOT` 不在默认位置，执行前显式指定即可：

```bash
CONTENT_ROOT=/path/to/marketing ./start-all.sh
```

## 服务器运维

先登录服务器：

```bash
ssh root@8.147.56.119
```

### PM2

```bash
pm2 status
pm2 logs genilink-frontend
pm2 logs genilink-content
pm2 restart genilink-frontend
pm2 restart genilink-content
pm2 save
```

### Nginx

```bash
nginx -t
systemctl reload nginx
systemctl status nginx
```

### Higress

```bash
systemctl status higress
systemctl restart higress
systemctl stop higress
systemctl start higress
cd /opt/higress-standalone/compose
/usr/local/bin/docker-compose ps
```

Higress 的网关和路由说明在独立工作空间里维护：
- [SERVER-INFO.md](E:/workspace/higress/SERVER-INFO.md)
- [higress-config-guide.md](E:/workspace/higress/higress-config-guide.md)
- [backend-deployment-guide.md](E:/workspace/higress/backend-deployment-guide.md)

### 远端智见

```bash
cd /root/geo-visibility-analyze
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop backend
```

## 部署流程

### 1. 本地同步到服务器

```bash
./deploy/deploy.sh
```

这个脚本还会在部署完成后把 `visibility` 的 DeepSeek 平台配置同步成
`gateway_search`，并把 citation 解析切到 `markdown`，这样审计链路经过
Higress 后仍然能拿到来源链接。

如果是在服务器本机上直接操作：

```bash
./deploy/deploy.sh local
```

### 2. 服务器侧重启

如果只是代码变更但环境未变，直接在服务器上重启进程即可：

```bash
pm2 restart genilink-frontend
pm2 restart genilink-content
systemctl restart higress
```

### 3. 配置变更

Nginx 或证书更新后：

```bash
nginx -t
systemctl reload nginx
```

## 日常检查

```bash
curl http://127.0.0.1:3001/
curl http://127.0.0.1:4002/
curl https://genilink.cn/health
curl http://127.0.0.1:8000/api/health
```

日志位置：

```bash
tail -f /var/log/genilink/frontend-out.log
tail -f /var/log/genilink/frontend-error.log
tail -f /var/log/genilink/content-out.log
tail -f /var/log/genilink/content-error.log
tail -f /var/log/nginx/genilink-error.log
```

## 备注

- 服务器侧以 `PM2 + Nginx + Higress` 为主，`systemd` unit 文件保留在仓库里作为备份参考。
- `start-all.sh` 负责本地智链和远端智见的联动启动，不替代服务器上的生产守护进程。
- 如果智见迁移到别的主机，只需要调整 `VISIBILITY_REMOTE_SSH_TARGET` 和 `VISIBILITY_REMOTE_ROOT`。
- 如果 Higress 迁移，只需要调整 `HIGRESS_REMOTE_SSH_TARGET` 和 `HIGRESS_REMOTE_ROOT`。
