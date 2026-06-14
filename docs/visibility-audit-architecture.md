# 可见性分析架构设计稿

版本：v1.0  
状态：设计冻结草案  
适用范围：`geo-visibility-analyze` 后端审计流水线、前端可见性分析页、审计报告页  
目标时间：上线前完成重构

## 1. 背景

当前可见性分析的核心流程已经跑通，但执行模型仍然是“单个后台任务 + 进程内事件总线 + 末尾隐式触发分析”。

现状代码集中在以下位置：

- [audit_service.py](/E:/workspace/geo-visibility-analyze/backend/app/services/audit_service.py)
- [audit_events.py](/E:/workspace/geo-visibility-analyze/backend/app/services/audit_events.py)
- [audits.py](/E:/workspace/geo-visibility-analyze/backend/app/api/audits.py)
- [response_analysis_service.py](/E:/workspace/geo-visibility-analyze/backend/app/services/response_analysis_service.py)
- [analysis.py](/E:/workspace/geo-visibility-analyze/backend/app/api/analysis.py)

这个设计在开发环境能工作，但它有三个结构性问题：

1. 审计状态的真相分散在内存、数据库和前端轮询里。
2. 审计主流程和响应分析流程耦合在一起，失败边界不清晰。
3. SSE 只是当前进程的临时广播，不能作为可靠进度来源。

项目还没上线，因此现在是把结构一次设计到位的最佳窗口。

## 2. 设计目标

- 审计流程可持久化、可恢复、可重试。
- 审计主流程与分析流程解耦。
- 任何阶段失败后，状态都能准确定位到阶段级别。
- 前端状态词汇保持稳定，不重写整套 UI。
- 设计适合单体应用起步，也能平滑演进到多 worker。

## 3. 非目标

- 不在第一版引入完整分布式任务平台。
- 不把审计拆成多个微服务。
- 不改前端现有状态术语体系。
- 不追求极致实时，优先保证可恢复和可观测。

## 4. 现状问题

### 4.1 单个长任务承担太多职责

`run_audit()` 现在同时负责：

- 读取 prompts 和 brands
- 并发查询外部平台
- 写入 `PlatformResponseRecord`
- 运行 source extraction
- 计算 `QueryResult`
- 更新 audit 最终状态
- 末尾再启动 `run_analysis_for_audit()`

这使得任何一个环节失败，都可能把整单 audit 卡在 `running`。

### 4.2 进度只存在于进程内

`audit_events.py` 目前用 `_subscribers` 保存 SSE 订阅者。

这意味着：

- worker 重启后进度丢失
- 多 worker 时消息不会跨进程传播
- SSE 不能作为状态真相

### 4.3 分析阶段是隐式副作用

`response_analysis_service.py` 本质上是第二阶段，但现在由审计末尾顺手触发。

问题是：

- 审计成功不代表分析成功
- 分析失败时没有明确的阶段状态
- 重试语义不清楚，容易误以为要整单重跑

## 5. 总体方案

推荐采用“持久化工作流 + 阶段状态机 + 进程外 worker”的结构。

### 5.1 三层模型

#### 执行层

负责按阶段执行 audit：

- 认领任务
- 执行阶段
- 短事务落库
- 更新心跳
- 支持重试与接管

#### 状态层

数据库保存审计真相：

- 当前阶段
- 阶段状态
- 失败原因
- 重试次数
- 心跳
- worker 认领信息

#### 展示层

前端通过 API 和 SSE 读取状态层：

- `GET /api/audits/{id}` 作为主真相
- `GET /api/audits/{id}/events` 只做实时投影
- 页面轮询作为兜底

### 5.2 统一数据流

```text
                +------------------+
                |  User starts run  |
                +---------+--------+
                          |
                          v
                +------------------+
                |      audits      |
                | stage/status/lock|
                +----+--------+----+
                     |        |
          claim/run   |        | poll/read
                     v        v
          +----------------+   +-------------------+
          | audit_stage_   |   | GET /api/audits/  |
          | runs           |   | {id}              |
          +--------+-------+   +-------------------+
                   |
                   v
        +----------------------+
        | audit_platform_runs  |
        | per-platform history |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | PlatformResponseRecord|
        +----------+-----------+
                   |
                   v
        +----------------------+
        | QueryResult / Report  |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | ResponseAnalysis      |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | audit_events_log     |
        +----------+-----------+
                   |
                   v
        +----------------------+
        | SSE projection       |
        | / events endpoint    |
        +----------------------+
```

### 5.3 统一状态流

```text
queued
  |
  v
querying
  |
  +--> platform_error -> partial / failed
  |
  v
persisting
  |
  v
calculating
  |
  +--> persistence_error -> failed
  |
  v
finalizing
  |
  +--> partial
  +--> completed

analysis stage (independent)
  pending -> running -> completed
                  \-> failed -> retrying
```

### 5.2 推荐实现形态

上线前最优方案不是“继续用 `asyncio.create_task()`”，而是：

- audit 创建后进入 `queued`
- worker 扫描并认领任务
- 每个阶段独立、可重放
- 分析阶段作为独立 workflow step

如果后续需要扩展，可以再叠加 Redis 队列或更强的 job runner。
但第一版不建议先把系统复杂度堆到消息队列上。

## 6. 状态机设计

### 6.1 审计主流程状态

建议审计主流程使用以下阶段：

- `queued`：已创建，等待认领
- `querying`：平台查询中
- `persisting`：平台响应落库与 source extraction 中
- `calculating`：生成 `QueryResult` 与汇总指标中
- `finalizing`：收尾和状态确认
- `completed`：全部完成
- `partial`：部分平台失败，但审计结束
- `failed`：致命失败，不能继续
- `stalled`：心跳超时，等待接管

### 6.2 分析阶段状态

响应分析单独维护：

- `pending`
- `running`
- `completed`
- `failed`
- `retrying`

### 6.3 前端状态映射

前端现有状态词汇保持不变：

- `queued` / `querying` -> `collecting`
- `persisting` / `calculating` / `analysis running` -> `analyzing`
- `partial` -> `partial`
- `completed` -> `completed`
- `failed` -> `failed`
- `stalled` -> 仍可显示为 `analyzing`，但文案提示“任务恢复中”

这样可以减少前端改动，避免状态体系整体重写。

## 7. 数据模型设计

### 7.1 `audits` 表扩展

建议新增字段：

- `stage`
- `stage_status`
- `stage_started_at`
- `stage_updated_at`
- `last_heartbeat_at`
- `attempt_count`
- `error_code`
- `error_message`
- `recoverable_error`
- `next_retry_at`
- `locked_by_worker`
- `locked_until`

这些字段的作用是：

- 让 `GET /api/audits/{id}` 直接反映当前执行真相
- 支持 worker 认领与租约超时接管
- 支持阶段级重试

### 7.2 新增 `audit_stage_runs`

建议新增阶段运行历史表：

- `id`
- `audit_id`
- `stage_name`
- `status`
- `attempt_no`
- `started_at`
- `finished_at`
- `error_code`
- `error_message`
- `input_snapshot`
- `output_snapshot`
- `worker_id`
- `duration_ms`

作用：

- 保存每次阶段执行历史
- 支持排障和回放
- 让“重试”不等于“覆盖历史”

### 7.3 新增 `audit_platform_runs`

审计的真实并发单位是平台，不是 stage。建议新增平台执行历史表：

- `id`
- `audit_id`
- `stage_run_id`
- `platform`
- `status`
- `attempt_no`
- `started_at`
- `finished_at`
- `duration_ms`
- `error_code`
- `error_message`
- `response_record_id`
- `worker_id`
- `retry_after`

用途：

- 精确定位哪一个平台挂了
- 追踪平台级重试与超时
- 给审计阶段提供可聚合的明细来源

### 7.4 可选新增 `audit_events_log`

如果希望更强的可观测性，可以再加一张事件表：

- `id`
- `audit_id`
- `stage_name`
- `event_type`
- `payload`
- `created_at`

用途：

- SSE 的持久化来源
- 前端断线后的事件补偿
- 审计时间线回放

如果第一版要控复杂度，也可以先只做 `audits` + `audit_stage_runs` + `audit_platform_runs`。  
但从“最优设计”角度看，事件日志是值得保留的。

## 8. 执行流程

### 8.1 创建审计

用户提交审计后：

1. 创建 `audits` 记录，状态设为 `queued`
2. 写入品牌快照、平台列表、项目快照
3. 创建第一条 stage run 记录
4. 返回 `audit_id`

不要在创建接口里直接启动长任务。

### 8.2 任务认领

worker 周期性扫描可执行任务：

- `queued`
- `stalled`
- `retrying`

通过事务写入租约字段：

- `locked_by_worker`
- `locked_until`

只有成功认领的 worker 才能执行该 audit。

### 8.3 平台查询阶段

该阶段负责：

- 并发调用平台 adapter
- 把平台响应写入 `PlatformResponseRecord`
- 同时写入 `audit_platform_runs` 的平台级执行历史
- 定期更新心跳

要求：

- 单个平台失败只标记该平台失败，不回滚整单
- 每个平台响应独立落库
- 任何长网络调用都不能占用同一个数据库事务

### 8.4 落库与结果计算阶段

平台查询完成后：

1. 生成 `QueryResult`
2. 运行 `detect_mentions`
3. 计算推荐顺序
4. 汇总平台成功率
5. 决定 `completed` / `partial`

### 8.5 分析阶段

审计主流程结束后，分析阶段单独执行：

1. 认领分析任务
2. 创建或更新 `ResponseAnalysis`
3. 调用 LLM
4. 写入分析结果
5. 标记分析阶段完成

分析失败不影响审计主结果。
分析任务必须具备幂等保护，避免 `GET /api/projects/{id}/content-intelligence` 或手动重试在短时间内触发重复运行。

## 9. SSE 与前端

### 9.1 现状问题

当前 `audit_events.py` 把 SSE 订阅者存进进程内字典。
这只能在单 worker、不中断的情况下工作。

### 9.2 新方案

SSE 不再是状态真相，而是状态投影：

- 连接建立时先返回当前 audit snapshot
- 后续事件来自数据库状态变化
- 前端断线后先读状态，再接收事件

### 9.3 前端行为

- 页面初始渲染先查 `GET /api/audits/{id}`
- SSE 只负责更快刷新
- SSE 断开后自动退回轮询

### 9.4 文案建议

- `collecting`：平台数据收集中
- `analyzing`：结果分析中
- `partial`：部分完成，部分平台失败
- `stalled`：任务中断，正在恢复
- `failed`：任务失败，显示错误原因

## 10. 错误与恢复语义

### 10.1 错误分类

- `platform_error`：平台请求失败、429、超时、认证失败
- `persistence_error`：数据库写入失败、事务异常
- `analysis_error`：LLM 调用失败、JSON 解析失败

### 10.2 恢复规则

- `platform_error`：按平台重试
- `persistence_error`：从最后成功提交点恢复
- `analysis_error`：仅重跑分析阶段
- `stalled`：租约过期后接管

### 10.3 幂等原则

所有阶段必须满足：

- 同一 audit 重跑不会重复写冲突数据
- 结果写入使用唯一约束或 upsert
- 租约过期可接管，但不会重复执行同一阶段的副作用
- 阶段重试基于状态机推进，不直接重复调用整条函数链

## 11. API 设计

### 11.1 `POST /api/audits`

创建 audit，返回：

- `audit_id`
- `stage`
- `status`

### 11.2 `GET /api/audits/{audit_id}`

返回：

- 当前状态
- 当前阶段
- 错误信息
- 心跳时间
- 重试次数

这是前端的主要真相来源。

### 11.3 `GET /api/audits/{audit_id}/events`

继续保留 SSE，但改成：

- 先投影当前快照
- 再推送增量事件
- 不依赖 `_subscribers` 作为唯一来源

### 11.4 分析重试

建议新增或强化：

- `POST /api/audits/{audit_id}/analysis/retry`

只重试分析阶段，不重跑审计主流程。

## 12. 代码改造范围

### 12.1 后端

重点文件：

- [backend/app/services/audit_service.py](/E:/workspace/geo-visibility-analyze/backend/app/services/audit_service.py)
- [backend/app/services/audit_events.py](/E:/workspace/geo-visibility-analyze/backend/app/services/audit_events.py)
- [backend/app/api/audits.py](/E:/workspace/geo-visibility-analyze/backend/app/api/audits.py)
- [backend/app/services/response_analysis_service.py](/E:/workspace/geo-visibility-analyze/backend/app/services/response_analysis_service.py)
- [backend/app/api/analysis.py](/E:/workspace/geo-visibility-analyze/backend/app/api/analysis.py)
- `backend/app/models/models.py`
- `backend/app/api/schemas.py`

### 12.2 前端

前端改动应保持小范围：

- 继续沿用现有状态映射
- 为 `stalled` 加兜底文案
- 为 `partial` 提供失败平台说明
- 保留轮询兜底

涉及页面：

- [src/app/(dashboard)/visibility/page.tsx](/E:/workspace/genilink-platform/src/app/(dashboard)/visibility/page.tsx)
- [src/app/(dashboard)/audits/page.tsx](/E:/workspace/genilink-platform/src/app/(dashboard)/audits/page.tsx)
- [src/app/(dashboard)/audits/[id]/report/page.tsx](/E:/workspace/genilink-platform/src/app/(dashboard)/audits/[id]/report/page.tsx)

## 13. What already exists

现有代码已经部分解决了这几个子问题，应该优先复用，而不是重写：

- `audit_events.py` 已经有审计事件的 SSE 通道，新的设计应保留它作为投影层，只替换真相来源。
- `audit-status.ts` 已经把 `partial`、`completed`、`failed`、`running` 的前端状态映射理顺了，新的阶段词汇可以直接接这层。
- `visibility/page.tsx` 已经实现了轮询兜底和 SSE 恢复，新的状态机只需要把后台输出对齐，不要改成另一套前端流转。
- `response_analysis_service.py` 已经是事实上的第二阶段，新的方案是把它显式化，不是发明全新分析系统。

## 14. NOT in scope

这版设计明确不包含以下工作：

- 完整分布式任务平台或外部队列系统，先把数据库驱动的工作流做稳。
- 审计历史的全文检索或复杂报表，先保证状态可恢复和可回放。
- 为每个查询结果引入独立缓存层，当前的瓶颈不在读取缓存。
- 重写前端状态体系，现有词汇足够承载新阶段。

## 15. 实施计划

### Phase 0：冻结设计

目标：

- 冻结阶段状态机
- 冻结数据字段
- 冻结 API 变化

交付物：

- 技术设计稿
- 状态机表
- 数据字段清单

### Phase 1：数据模型

目标：

- 给 `audits` 增加阶段字段和心跳字段
- 新增 `audit_stage_runs`
- 需要时新增 `audit_events_log`

验收标准：

- 从数据库能直接看出 audit 当前处于哪一步
- 可以追踪历史阶段执行记录

### Phase 2：执行器重构

目标：

- 把 `run_audit()` 拆成阶段驱动器
- 每个阶段只持有短事务
- 引入 worker 认领与租约机制

验收标准：

- 平台超时不会把整单卡死
- 事务异常后可以从阶段边界恢复

### Phase 3：SSE 状态投影

目标：

- SSE 只做实时投影
- 断线可恢复
- 不依赖内存订阅者作为唯一来源

验收标准：

- worker 重启后状态仍然正确
- 前端刷新后不丢状态

### Phase 4：分析阶段独立化

目标：

- 把分析作为独立阶段
- 支持单独重试
- 不影响审计主结果

验收标准：

- 审计成功后分析可延后执行
- 分析失败不会把审计状态回滚成 `running`

### Phase 5：前端适配

目标：

- 加 `stalled` 展示
- 优化 `partial` 展示
- 确保轮询兜底正常

验收标准：

- 用户能区分“运行中”“卡住了”“部分完成”“真正失败”

### Phase 6：测试与回归

目标：

- 覆盖状态机
- 覆盖重试
- 覆盖幂等
- 覆盖断线恢复

验收标准：

- 关键异常路径有测试
- 没有只覆盖 happy path 的盲区

## 16. 测试策略

### 单元测试

- audit 状态映射
- 阶段转换
- 认领与租约
- 分析重试
- SSE snapshot 生成

### 集成测试

- 平台部分失败后返回 `partial`
- 持久化异常后 audit 不悬挂
- worker 重启后状态可恢复
- 分析失败后可单独重试

### E2E 测试

- 创建审计后状态流转正确
- SSE 断线后轮询兜底正确
- `partial` 页面可见失败平台说明
- 重试按钮只触发对应阶段
- 同一审计在多个浏览器标签同时刷新时不会触发重复分析
- 平台超时后只重试失败的平台，不重跑已经成功的平台

## 17. 风险与对策

### 风险 1：状态机过细

对策：

- 只保留恢复语义真正需要的阶段
- 不做炫技式拆分

### 风险 2：多 worker 认领冲突

对策：

- 用租约控制
- 用乐观更新或唯一约束避免重复执行

### 风险 3：SSE 被误认为真相

对策：

- 所有页面都先读数据库状态
- SSE 只做增量刷新

### 风险 4：分析拖慢主流程

对策：

- 分析独立
- 审计完成即收口
- 分析可延后或补跑

## 18. 结论

如果项目还没上线，最优策略不是修补现有长任务，而是直接把可见性分析设计成可持久化、可恢复、可观测的工作流。

一句话总结：

- 审计主流程和分析流程拆开
- 状态落库，不依赖内存
- SSE 只是展示层
- 每个阶段都能重试和接管

这能保证即使 worker 重启、平台超时、数据库短暂失败，用户也不会再看到一个永远转圈的“分析中”。
