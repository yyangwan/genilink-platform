# 可见性分析实施计划

版本：v1.0  
依据文档：[可见性分析架构设计稿](./visibility-audit-architecture.md)

## 目标

把当前“单个后台任务 + 进程内 SSE + 隐式分析触发”的实现，改造成：

- 持久化工作流
- 阶段可恢复
- 平台级可追踪
- 分析阶段独立
- 前端状态稳定

## 里程碑

### M0: 设计冻结

输出：

- 状态机冻结
- 数据表冻结
- API 变更冻结
- 测试范围冻结

验收：

- 不再改架构边界，只做实现

### M1: 数据模型落地

输出：

- `audits` 增加 stage / lock / heartbeat 字段
- 新增 `audit_stage_runs`
- 新增 `audit_platform_runs`
- 新增 `audit_events_log`

验收：

- 数据库能表达当前审计的执行真相
- 可以看到 stage 级和平台级历史

### M2: 执行器重构

输出：

- `run_audit()` 拆为阶段驱动器
- worker 认领和租约
- 平台查询、落库、计算、收尾分阶段执行

验收：

- 平台失败不会拖死整单
- 阶段失败可以按边界恢复

### M3: 分析独立化

输出：

- `response_analysis_service.py` 改成独立阶段
- 分析重试接口只重试分析
- 读路径不再隐式启动分析

验收：

- 审计主流程与分析流程互不拖累
- 分析重复触发有幂等保护

### M4: SSE 与前端对齐

输出：

- SSE 改成状态投影
- 前端状态映射保持稳定
- 轮询兜底保留

验收：

- 刷新、断线、恢复都不丢状态
- 用户能区分 collecting / analyzing / partial / failed

### M5: 测试与回归

输出：

- 单元测试覆盖状态机和幂等边界
- 集成测试覆盖 worker 接管与失败重试
- E2E 覆盖前端状态流转

验收：

- 关键路径没有只靠人工验证的黑洞

## 任务拆分

### 1. 数据模型

#### 1.1 扩展 `audits`

任务：

- 增加 `stage`
- 增加 `stage_status`
- 增加 `stage_started_at`
- 增加 `stage_updated_at`
- 增加 `last_heartbeat_at`
- 增加 `attempt_count`
- 增加 `error_code`
- 增加 `error_message`
- 增加 `recoverable_error`
- 增加 `next_retry_at`
- 增加 `locked_by_worker`
- 增加 `locked_until`

依赖：

- 无

#### 1.2 新增 `audit_stage_runs`

任务：

- 记录审计阶段执行历史
- 记录每次阶段输入输出快照

依赖：

- 1.1

#### 1.3 新增 `audit_platform_runs`

任务：

- 记录平台级执行历史
- 记录平台状态、耗时、错误、重试

依赖：

- 1.1

#### 1.4 新增 `audit_events_log`

任务：

- 记录审计事件流
- 提供回放和排障来源

依赖：

- 1.1

### 2. 执行层

#### 2.1 拆分 `run_audit()`

任务：

- 把长函数拆成阶段函数
- 每个阶段只做短事务

依赖：

- 1.1, 1.2, 1.3

#### 2.2 加 worker 认领与租约

任务：

- 通过 `locked_by_worker` / `locked_until` 认领任务
- 租约过期后允许接管

依赖：

- 1.1, 2.1

#### 2.3 平台级执行历史写入

任务：

- 平台查询时同步写 `audit_platform_runs`
- 平台失败只标记该平台失败

依赖：

- 1.3, 2.1

#### 2.4 阶段级状态推进

任务：

- `queued -> querying -> persisting -> calculating -> finalizing`
- 失败时推进到 `partial` / `failed`

依赖：

- 1.1, 2.1

### 3. 分析层

#### 3.1 显式化分析任务

任务：

- 把 `response_analysis_service.py` 变成独立阶段
- 不再由审计尾部隐式启动

依赖：

- 2.1

#### 3.2 读路径去隐式触发

任务：

- `GET /api/projects/{project_id}/content-intelligence` 只读
- 只返回聚合，不启动分析

依赖：

- 3.1

#### 3.3 分析重试接口

任务：

- `POST /api/audits/{audit_id}/analysis/retry`
- 只重试分析，不重跑审计

依赖：

- 3.1

### 4. API 与 SSE

#### 4.1 审计详情接口

任务：

- 返回 stage、锁、心跳、错误、重试信息

依赖：

- 1.1, 2.4

#### 4.2 SSE 状态投影

任务：

- 连接时先发 snapshot
- 后续发增量事件

依赖：

- 1.4, 4.1

#### 4.3 前端轮询兜底

任务：

- 保留 `GET /api/audits/{id}` 轮询
- SSE 断线后自动恢复

依赖：

- 4.1, 4.2

### 5. 前端

#### 5.1 状态映射对齐

任务：

- 继续使用 `collecting` / `analyzing` / `partial` / `failed`
- 新增 `stalled` 兜底文案

依赖：

- 4.1

#### 5.2 审计页刷新与恢复

任务：

- 页面刷新后恢复当前审计状态
- 断线后轮询继续

依赖：

- 4.2, 4.3

#### 5.3 报告页状态展示

任务：

- `partial` 展示失败平台说明
- `failed` 展示具体错误

依赖：

- 4.1, 5.1

## 推荐实现顺序

1. 数据模型
2. 执行器重构
3. 分析层独立化
4. API 与 SSE 对齐
5. 前端适配
6. 测试补齐

## 并行建议

### Lane A

- 数据模型
- 执行器重构

### Lane B

- 前端状态展示
- SSE 投影改造

### Lane C

- 测试补齐
- 分析重试与读路径去触发

说明：

- A 和 B 可以在模型 API 冻结后并行推进
- C 依赖 A/B 的接口细节，适合后置补齐

## 测试清单

### 单元测试

- audit status 映射
- stage transition
- lease 过期接管
- 平台失败只影响单个平台
- 分析幂等保护

### 集成测试

- 审计中途 worker 崩溃后可恢复
- 多次触发分析不会重复写入
- SSE 断线后 snapshot 恢复正确

### E2E 测试

- 创建审计后状态流转正确
- `partial` 与 `failed` 页面提示正确
- 刷新页面后状态不丢失

## 明确不做

- 分布式任务平台
- 新的缓存层
- 全文检索报表
- 前端状态体系重写

## 完成标准

- 审计主流程可恢复
- 平台级问题可定位
- 分析阶段可独立重试
- 前端不会再长期停在假“分析中”

