# 提示词删除故障修复方案

## 背景

智见项目空间里的提示词列表已按 `id` 返回并用于删除。当前删除仍返回 `502`，不是前端删错了数据，而是后端认证阶段在拉取 JWKS 时失败，导致请求还没进入提示词软删除逻辑。

## 现状

- 前端删除请求已经打到 `/api/integration/prompts/{id}?projectId=...`
- 后端提示词接口已改成软删除，删除成功时返回 `204 No Content`
- 后端认证服务默认从 `GENILINK_JWKS_URL` 读取 JWKS
- 本地开发的正确 JWKS 地址是 `http://localhost:3001/.well-known/jwks.json`
- 运行中的后端进程没有稳定拿到这个本地地址时，会回退到线上默认地址，认证会直接失败

## 根因

问题不在提示词数据本身，而在后端环境注入。

`backend/app/config.py` 只自动读取 `backend/.env`，不会自动加载 `backend/.env.local`。

如果后端启动方式没有显式注入：

```env
GENILINK_JWKS_URL=http://localhost:3001/.well-known/jwks.json
```

那么后端就会继续请求默认的线上 JWKS 地址，导致：

1. `verify_genilink_token()` 报错
2. 提示词删除请求在认证阶段失败
3. 前端最终只能看到 `502 Bad Gateway`

## 修复方案

### 方案 A: 在本地启动环境里显式注入 JWKS 地址

推荐优先级最高，改动最小。

需要保证以下任一入口都能拿到该变量：

- 本地手动启动 backend 时的 shell 环境
- `docker-compose.yml` 的 `backend.environment`
- 任何启动脚本或服务管理器

### 方案 B: 让 backend 本地开发自动读取 `.env.local`

如果希望减少本地启动依赖，可以让 backend 配置层合并读取 `.env.local`。

这样做的好处：

- 不容易漏环境变量
- 重启后行为更稳定

代价：

- 需要确认不会覆盖生产环境的变量注入策略

## 验收标准

删除一个已被审计历史引用的提示词时：

- 后端认证成功
- 请求进入 `DELETE /api/prompts/{prompt_id}`
- 软删除成功时返回 `204`
- 前端不再显示 `502`

## 建议执行顺序

1. 先确认当前运行中的 backend 进程环境里是否真的包含 `GENILINK_JWKS_URL`
2. 如果没有，优先把它加到本地启动方式或 compose 配置里
3. 再重启 backend 和前端
4. 重新删除 `prompt_id = 274` 做回归验证

## 备注

- 这不是提示词主键问题
- 这也不是软删除逻辑问题
- 这是本地开发环境下 JWKS 地址没稳定注入的问题
