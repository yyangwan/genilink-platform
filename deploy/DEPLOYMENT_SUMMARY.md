# GeniLink 当前部署摘要

服务器: `8.147.56.119`
域名: `genilink.cn`
记录日期: `2026-06-14`

## 当前状态

- 智链前台运行在 `3001`
- 智创 / ContentOS 运行在 `4002`
- Higress 运行在同一台服务器上，管理目录是 `/opt/higress-standalone/compose`
- 智见通过 `https://genilink.cn/visibility` 对外提供服务
- 服务器侧常用管理方式是 `PM2 + Nginx + Higress`

## 关键文件

- [deploy/README.md](/E:/workspace/genilink-platform/deploy/README.md) - 完整运维手册
- [deploy/deploy.sh](/E:/workspace/genilink-platform/deploy/deploy.sh) - 代码同步和重启
- [deploy/setup-server.sh](/E:/workspace/genilink-platform/deploy/setup-server.sh) - 服务器初始化
- [deploy/ecosystem.config.js](/E:/workspace/genilink-platform/deploy/ecosystem.config.js) - PM2 配置
- [deploy/nginx-genilink.conf](/E:/workspace/genilink-platform/deploy/nginx-genilink.conf) - HTTPS 反向代理配置
- [start-all.sh](/E:/workspace/genilink-platform/start-all.sh) - 本地工作区启动脚本

## 快捷命令

```bash
ssh root@8.147.56.119
pm2 status
pm2 restart genilink-frontend
pm2 restart genilink-content
systemctl status higress
systemctl restart higress
nginx -t
systemctl reload nginx
```

```bash
./start-all.sh status
./start-all.sh restart
./start-all.sh restart-visibility
```

## 变更说明

这份摘要只保留当前可执行入口和管理方式，详细步骤统一看 [deploy/README.md](/E:/workspace/genilink-platform/deploy/README.md)。
