# 智见建议 → 智创内容工作流 运行手册

> 对应设计：`docs/zhijian-to-zhichuang-content-workflow-design.md` v1.0
> 适用：ContentOS（`E:\workspace\marketing`，端口 4002）+ GeniLink Portal（本仓库，端口 3001）

## 1. 架构速览

```
浏览器 ──suggestionId/briefId/workflowId──► Portal BFF
   │                                        │ service JWT (RS256, aud content.genilink.cn)
   │                                        ├──► 智见 Visibility（规范建议）
   │                                        └──► ContentOS（Brief/工作流/平台生成）
   │                                             │ 共享密钥回调（commit/release 额度）
   │                                             ▼
   │                                        Portal /api/internal/content-usage/*
   └── ContentOS worker（cron 驱动 + 创建后 kick）──► LLM
```

- 事实来源：Brief/工作流/平台状态在 ContentOS MySQL（`ContentBrief`/`ContentWorkflow`/`ContentGenerationRun`）；额度账本在 Portal PG（`UsageEvent`，reserved/committed/pending_reconcile/released）。
- 对账关联：`operationId = content-workflow:<workspaceId>:<sha256(Idempotency-Key)>`。

## 2. 环境变量

| 仓库 | 变量 | 说明 |
|---|---|---|
| 两仓库 | `CONTENT_USAGE_CALLBACK_SECRET` | 共享密钥（必须同值）。缺失时额度回调 fail-closed（503/不生成） |
| 两仓库 | `CONTENT_WORKFLOW_DISABLED` | 故障停用开关。设为 `true` 时：拒绝新提交（Brief/工作流/人工重试 503）+ 暂停领取（cron 与 inline kick 空转）。删除该变量或置 false 恢复，已保存数据不动 |
| ContentOS | `GENILINK_PORTAL_URL` | Portal 地址（如 `http://127.0.0.1:3001`） |
| ContentOS | `CRON_SECRET` | cron 路由鉴权（已存在） |
| Portal | `CONTENT_SERVICE_URL` | ContentOS 地址。**注意 `.env` 默认 4003，本地 `start-all.sh` 起 4002**，联调时在 `.env.local` 覆盖为 `http://127.0.0.1:4002` |
| Portal | `BILLING_CRON_SECRET` | 对账 sweeper 鉴权（已存在） |
| ContentOS | `MOCK_AI` | `true` 时不调 LLM（冒烟用） |

## 3. 数据库

- ContentOS（MySQL，schema-first `db push` 惯例）：新增 `ContentBrief`、`ContentWorkflow`、`ContentGenerationRun`。**注意：远端库存在存量备份表 `platformapiconfig_backup_20260821`（1 行），`db push` 会要求删除它——已确认保留不动，禁止对本库执行 `db push`**。所有变更用精确 SQL：
  - 建表（2026-09-09，首次部署）
  - 评审整改加列（2026-09-10，均已应用）：
    ```sql
    ALTER TABLE ContentBrief
      ADD COLUMN refinementBaseRevision INT NULL,
      ADD COLUMN refinementBaseBrief MEDIUMTEXT NULL,
      ADD COLUMN lastPatchKey VARCHAR(64) NULL,
      ADD COLUMN lastPatchHash VARCHAR(64) NULL,
      ADD COLUMN lastPatchResponse MEDIUMTEXT NULL;
    ALTER TABLE ContentWorkflow
      ADD COLUMN templateId VARCHAR(64) NULL;
    ```
- Portal（PG，迁移文件）：`20260909113411_usage_reservation_ledger`（UsageEvent 预占字段 + 部分唯一索引）。部署时随 release 流程执行 `prisma migrate deploy`。

## 4. 部署顺序（必须 ContentOS 先、Portal 后）

1. ContentOS：`npm run release:check` → 合并 → 部署（含 `prisma db push`/建表确认）→ 冒烟：
   - `GET /api/capabilities/content-generation` 返回 4 平台 enabled
   - `GET /api/cron/refine-briefs`（带 Bearer CRON_SECRET）→ `{data:{claimed:0,...}}`
   - `GET /api/cron/generate` → 同上
2. Portal：`npm run release:check` → 合并 → 部署（`prisma migrate deploy`）→ 冒烟：
   - `POST /api/internal/content-usage/reconcile`（Bearer BILLING_CRON_SECRET）→ `200`
   - 登录后概览页点击建议「AI 生成」→ 3 秒内进入 `/content/new?briefId=...`

## 5. 定时任务注册（外部调度器）

| 任务 | 调用 | 频率 |
|---|---|---|
| Brief 提炼 | `GET {ContentOS}/api/cron/refine-briefs`，`Authorization: Bearer ${CRON_SECRET}` | 30s |
| 平台生成 | `GET {ContentOS}/api/cron/generate`，同上 | 15–30s |
| 额度对账 | `POST {Portal}/api/internal/content-usage/reconcile`，`Authorization: Bearer ${BILLING_CRON_SECRET}` | 60s |

创建/重试路由会机会性 kick 一次生成批次（不阻塞响应），cron 是兜底的事实来源。

## 6. 监控与告警（§15.3）

按 `event` 字段聚合结构化 JSON 行日志（两仓库 stdout）：

- `content_brief.baseline_created / refinement_succeeded / refinement_fallback`（回退率 30min > 20% 告警）
- `content_workflow.created / usage_committed / completed`
- `content_generation.started / succeeded / failed / retried`（单平台 15min 失败率 > 10% 告警）
- `content_usage.reconcile_required / reconciled`（`reconcile_required` 持续出现或 reserved > 30min 告警）

关键排障查询：
- 额度对不齐：按 `operationId` 关联 Portal `UsageEvent` 与 ContentOS `ContentWorkflow.usageStatus`
- 重复生成：`ContentGenerationRun.attemptCount` 异常增长 / `lockedBy` 频繁变更（租约接管 > 5 次/10min 告警）

## 7. 故障处置

| 症状 | 处置 |
|---|---|
| 生成全部卡在 queued | 检查 cron 是否在调 `/api/cron/generate`；查 `content_generation.failed_*` 的 failureCode |
| 大量 `USAGE_COMMIT_UNAVAILABLE` | Portal 内部回调不可达：查 `CONTENT_USAGE_CALLBACK_SECRET` 两仓库是否一致、`GENILINK_PORTAL_URL` 是否正确。任务会自动重试，不需人工干预 |
| 提炼一直 fallback | 查 `refinementLastError`（gate-违规代码或 LLM 错误）；规则版仍可用，不影响创建 |
| 结果不确定的提交 | 客户端保留幂等键并持久化到 sessionStorage，刷新后自动同键重放找回；后台对账每分钟收敛 `pending_reconcile` |
| 单平台 `PROVIDER_RESULT_UNCONFIRMED` | 进程在模型请求后中断，结果无法确认（不能自动重跑，避免重复消耗）。用户在进度页点「确认并重试」即人工确认重跑 |
| **紧急停用（入口+领取）** | ① 两仓库生产环境设 `CONTENT_WORKFLOW_DISABLED=true` 并重启/重载进程（Portal 容器 + ContentOS pm2）→ 新提交 503、cron/inline kick 空转；② 如需彻底停调度，再停外部 cron 对 `/api/cron/generate` 与 `/api/cron/refine-briefs` 的调用。**只停 cron 不够**：inline kick 仍会领取已有任务（这是本开关存在的原因）。额度回调密钥与数据库无需动 |
| 恢复 | 删除 `CONTENT_WORKFLOW_DISABLED`（或置 false）并重载；已创建的工作流/预占额度原样保留，worker 恢复领取，租约过期的 generating 会被自动接管或标记 `PROVIDER_RESULT_UNCONFIRMED` 待人工确认 |

## 8. 回滚

回滚 = git revert（无兼容期开关）。注意：
- 已创建的工作流由已部署 worker 继续完成；Portal 回滚后无法查询新工作流状态，但 ContentOS 侧数据完好
- UsageEvent 只通过补偿状态转换处理，禁止直接删账本记录
- ContentOS 新表对旧代码无影响（只增不删）

## 9. 已知偏差（相对设计文档）

1. **内部回调鉴权**用共享密钥 Bearer（D8）而非"ContentOS audience service JWT"——ContentOS 没有 Portal 私钥，发放私钥比共享密钥更差；两仓库均有 CRON_SECRET 先例。
2. **schema 漂移**：ContentOS 远端库的 `platformapiconfig_backup_20260821` 未删除（等待确认），本次用精确 SQL 建表。
3. Portal `.env` 的 `CONTENT_SERVICE_URL` 默认 4003 与 start-all.sh 的 4002 不一致（历史遗留），联调需在 `.env.local` 覆盖。
