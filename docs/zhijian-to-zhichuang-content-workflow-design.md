# 智见优化建议到智创内容创建链路技术设计

> 文档状态：待实施
>
> 设计版本：1.0
>
> 更新日期：2026-09-08
>
> 涉及系统：GeniLink Portal、智见 Visibility Service、智创 ContentOS
>
> 目标读者：产品、前端、后端、AI 工程、测试与运维人员

## 1. 文档目标

本文定义从“智见优化建议”到“智创内容创建”的稳定生产链路。实施完成后，用户可以从一条优化建议出发，获得经过提炼的创作方案，确认后创建内容，并在部分平台失败时恢复执行，而不会遇到建议原文搬运、项目串用、字段丢失、重复扣额或重复草稿。

本文同时作为以下工作的共同依据：

- GeniLink Portal 与 ContentOS 的接口改造；
- ContentOS 数据库迁移与生成任务执行；
- 智见建议结构的后续升级；
- 前端交互和客户文案；
- 联调、回归、灰度、监控与回滚。

本文描述的是目标设计。现有接口和数据结构仅作为迁移起点，不代表目标契约。

## 2. 背景与现状

### 2.1 当前链路

```text
浏览器加载智见建议列表
    ↓
浏览器把完整 suggestion 对象传给 Portal
    ↓
Portal 同步调用 LLM 或规则生成 Brief
    ↓
Brief 序列化进 URL 查询参数
    ↓
智创新建页从 URL 恢复部分字段
    ↓
浏览器先创建 ContentPiece
    ↓
浏览器再逐平台请求生成内容
```

### 2.2 已确认的问题

| 问题 | 当前表现 | 客户影响 |
|---|---|---|
| 建议来源不可信 | Portal 直接使用浏览器回传的完整建议 | 建议可能被篡改，无法证明内容来自哪条智见建议 |
| Brief 没有持久化 | 通过 URL 查询参数传递 | 字段丢失、URL 过长、浏览器历史泄露、刷新和分享不可靠 |
| 项目绑定缺失 | 新建页使用当前全局项目 | 切换项目或恢复旧页面后可能把 A 项目的建议用于 B 项目 |
| 约束信息丢失 | `intent`、`mustMention`、`avoid` 等字段未进入 ContentOS | AI 失去事实与品牌边界，内容容易泛化或编造 |
| 创建和生成分离 | 浏览器先创建，再调用生成 | 生成失败留下空草稿，重试会创建重复记录 |
| 额度重复计算 | Brief 转换和内容生成各记录一次 | 同一次创作可能消耗两次“内容生成”额度 |
| 平台能力不一致 | Portal 暴露 6 个平台，ContentOS 仅实现 4 个 | 知乎、头条可能先被默认为微信，随后生成失败 |
| 多平台串行执行 | 每个平台最长等待 180 秒 | 六个平台最坏等待约 18 分钟，页面长时间无反馈 |
| 流式超时不完整 | 收到响应头后清除超时 | 上游响应体停滞时，请求可能长期挂起 |
| AI 约束优先级错误 | 模型输出可以替换服务端备注与限制 | 模型可能删掉不得编造、项目边界等硬约束 |
| 转换质量校验过窄 | 只检查是否复制 `suggestion.text` | 仍可能原样复制描述、验收标准、审计结论等内部话术 |
| 缺少跨服务契约测试 | 两个仓库独立维护类型 | 字段或枚举漂移只能在线上暴露 |

## 3. 设计目标

### 3.1 业务目标

1. 把内部优化任务转成读者可理解、可直接创作的内容方案。
2. 让用户在生成前看清主题、结构、平台、事实依据和限制，并能修改确认。
3. 同一操作重复点击、刷新或网络重试时，不重复创建内容、不重复扣额。
4. 多平台生成允许部分成功，失败平台可以单独重试。
5. 每一篇内容都能追溯到原始建议、项目、Brief 版本和生成版本。

### 3.2 技术目标

- 服务端重新读取智见的规范建议，不信任浏览器回传业务对象；
- 使用持久化、版本化、项目绑定的 `ContentCreationBriefV1`；
- 使用一个可恢复的内容工作流替代浏览器端“创建 + 生成”两阶段调用；
- 额度预占、提交、释放和内容工作流使用同一操作 ID；
- 所有跨服务输入执行运行时校验、长度限制和枚举校验；
- 使用数据库状态与租约作为任务真相，不依赖浏览器连接；
- 支持独立部署两个服务，并允许兼容期内安全回滚。

### 3.3 成功指标

| 指标 | 目标 |
|---|---:|
| Brief 基础版本创建成功率 | ≥ 99.9% |
| Brief 创建接口 P95 | ≤ 3 秒，不等待 LLM |
| 内容工作流受理接口 P95 | ≤ 2 秒 |
| 重复 ContentPiece 比例 | 0 |
| 同一工作流重复扣额比例 | 0 |
| 跨项目读取或创建 | 0 |
| 关键约束跨服务丢失 | 0 |
| 可恢复的平台级失败覆盖率 | 100% |
| AI 输出回退后仍可进入创建页 | ≥ 99.9% |

## 4. 非目标

以下内容不属于第一版改造范围：

- 自动发布到外部平台；
- 自动确认 Brief 并跳过用户检查；
- 对所有历史内容反向补齐来源建议；
- 第一版同时新增知乎和今日头条生成器；
- 引入新的外部消息队列产品；
- 在一次工作流中生成多篇不同主题的内容；
- 使用 AI 自动修改不可覆盖的事实与合规限制。

## 5. 冻结的设计决策

### 5.1 服务边界

| 系统 | 责任 | 不承担的责任 |
|---|---|---|
| 智见 Visibility Service | 建议事实来源、建议与项目归属、审计证据 | 不创建 ContentOS 内容记录 |
| GeniLink Portal | 用户鉴权、项目鉴权、读取规范建议、订阅和额度、面向浏览器的 BFF 接口 | 不保存 ContentOS 内容正文，不在浏览器编排跨服务事务 |
| 智创 ContentOS | Brief、内容工作流、平台任务、ContentPiece、提示词与生成结果 | 不信任浏览器提供的项目或建议来源，不决定客户套餐额度 |

ContentOS 是 Brief 和内容生成工作流的唯一事实来源。Portal 只返回经过权限过滤的视图。

### 5.2 持久化 Brief，而不是传递大对象

页面只使用：

```text
/content/new?briefId=<opaque-id>
```

URL 中不得再出现主题、要点、备注、引用、建议原文或项目资料。

### 5.3 先规则产出，再异步提炼

ContentOS 收到规范来源快照后，必须先同步生成并保存规则版 Brief，再返回 `briefId`。AI 提炼作为异步任务更新同一 Brief。

- 没有 LLM 配置、LLM 超时或输出不合格时，规则版仍然可用；
- 用户无需等待 LLM 才能进入创建页；
- AI 结果只能补充创作表达，不能删除服务端硬约束；
- 用户已经编辑 Brief 时，迟到的 AI 结果不能覆盖用户修改。

### 5.4 一个 Brief 可以产生多个明确版本的工作流

用户每次确认生成时，工作流绑定 `briefId + briefRevision`。同一个幂等键只能对应同一个请求体；用户主动修改 Brief 并重新生成时使用新的幂等键，产生新的工作流并按产品规则消耗新的额度。

### 5.5 第一版只开放 ContentOS 已实现的平台

第一版规范生成平台：

```text
wechat | weibo | xiaohongshu | douyin
```

智见建议仍可指出知乎或今日头条，但 Portal 必须显示“不支持自动生成”，并要求用户选择已支持的平台。禁止静默改成微信。

后续新增平台必须同时完成：类型、能力接口、提示词构建器、生成测试、前端展示和契约测试。

### 5.6 额度只按工作流计一次

- 创建和 AI 提炼 Brief 不消耗 `content_generation`；
- 用户确认并提交内容工作流时预占 1 次额度；
- ContentOS 第一次向内容模型发起请求前提交额度；
- 同一工作流的多平台生成和失败重试不重复扣额；
- 在任何模型请求发生前取消或永久校验失败，释放预占额度；
- 模型请求已经发出后，即使供应商失败，仍视为一次生成尝试并提交额度。

## 6. 总体架构

```text
┌──────────────────┐
│   Browser / UI   │
└────────┬─────────┘
         │ suggestionId / briefId / workflowId
         ▼
┌──────────────────────────────────────────────┐
│ GeniLink Portal                              │
│ - session/workspace/project permission       │
│ - canonical suggestion loader                │
│ - billing reservation ledger                 │
│ - BFF response shaping                       │
└────────┬──────────────────────┬───────────────┘
         │ service JWT          │ service JWT
         ▼                      ▼
┌──────────────────┐   ┌─────────────────────────────┐
│ Visibility       │   │ ContentOS                   │
│ canonical source │   │ - ContentBrief              │
└──────────────────┘   │ - ContentWorkflow           │
                       │ - ContentGenerationRun       │
                       │ - DB lease worker            │
                       │ - ContentPiece               │
                       └─────────────┬───────────────┘
                                     │
                                     ▼
                              ┌──────────────┐
                              │ LLM Provider │
                              └──────────────┘
```

### 6.1 请求真相与任务真相

- HTTP 响应只表示请求是否被受理；
- Brief、工作流和平台执行状态以 ContentOS 数据库为准；
- 额度预占和扣减状态以 Portal PostgreSQL 为准；
- 浏览器刷新、关闭或断网不会终止已受理的工作流；
- 两个系统通过同一个 `operationId` 对账。

## 7. 端到端流程

### 7.1 从建议创建 Brief

```text
Browser          Portal              Visibility          ContentOS
   │ POST suggestionId │                  │                   │
   ├──────────────────►│                  │                   │
   │                   │ verify auth      │                   │
   │                   │ GET canonical    │                   │
   │                   ├─────────────────►│                   │
   │                   │ suggestion       │                   │
   │                   │◄─────────────────┤                   │
   │                   │ validate + map   │                   │
   │                   │ POST source snapshot + idem key      │
   │                   ├─────────────────────────────────────►│
   │                   │                     persist baseline │
   │                   │                     queue refinement │
   │                   │ briefId + baseline                  │
   │                   │◄─────────────────────────────────────┤
   │ 201 briefId       │                  │                   │
   │◄──────────────────┤                  │                   │
   │ navigate by ID    │                  │                   │
```

关键规则：

1. Portal 忽略浏览器提交的建议正文，只接受 `suggestionId`。
2. Portal 必须通过当前 `workspaceId + projectId` 查询建议。
3. Portal 只把白名单字段组成规范来源快照，禁止透传未知字段。
4. ContentOS 在一个数据库事务中写入 Brief 基础版和提炼待执行状态。
5. 相同幂等键和相同请求哈希返回原 Brief；相同键不同请求返回 409。

### 7.2 AI 异步提炼 Brief

```text
ContentOS worker claims brief with lease
    ↓
build prompt from immutable source/project snapshots
    ↓
LLM returns bounded JSON
    ↓
schema + factual boundary + source-overlap validation
    ├─ pass: merge by precedence and save refined candidate
    └─ fail: keep baseline and save fallback reason
    ↓
if current revision == refinement base revision
    ├─ yes: publish refined effective brief
    └─ no: keep user-edited effective brief; retain candidate for audit only
```

前端进入页面后读取基础版，并以 2 秒、3 秒、5 秒的退避间隔查询提炼状态，最多主动查询 15 秒。超过后停止轮询，页面仍可编辑和提交；用户再次进入时会读取最新状态。

### 7.3 用户确认并创建内容

```text
Browser              Portal                 ContentOS              LLM
   │ POST workflow      │                       │                    │
   ├───────────────────►│                       │                    │
   │                    │ reserve usage         │                    │
   │                    │ POST workflow         │                    │
   │                    ├──────────────────────►│                    │
   │                    │                       │ transaction:       │
   │                    │                       │ workflow + piece + │
   │                    │                       │ platform runs      │
   │                    │ 202 workflowId        │                    │
   │                    │◄──────────────────────┤                    │
   │ 202 workflowId     │                       │                    │
   │◄───────────────────┤                       │                    │
   │                    │                       │ worker claims run  │
   │                    │ commit usage callback│                    │
   │                    │◄──────────────────────┤                    │
   │                    │ committed             │                    │
   │                    ├──────────────────────►│                    │
   │                    │                       │ request generation │
   │                    │                       ├───────────────────►│
```

Portal 在 ContentOS 返回明确的 4xx 前可以释放预占。遇到超时或连接中断时，Portal 不得立即释放，而应把预占标记为 `pending_reconcile`，随后使用 `operationId` 查询 ContentOS，避免“内容已创建但额度被释放”。

### 7.4 平台生成与重试

每个平台拥有独立执行记录。Worker 可以有限并行执行不同平台，第一版并发上限为每个工作流 2 个平台、每个实例 4 个模型请求。

```text
workflow: generating
  ├─ wechat:      succeeded
  ├─ weibo:       failed_retryable
  └─ xiaohongshu: succeeded

aggregate status = partial
```

用户重试微博时，只把微博运行记录重新置为 `queued`，复用同一个工作流和已提交的额度记录。

## 8. 领域模型

### 8.1 模型关系

```text
ContentBrief 1 ─── N ContentWorkflow 1 ─── 1 ContentPiece
                           │
                           └──── N ContentGenerationRun ─── 1 PlatformContent

Portal UsageEvent.operationId ◄──── ContentWorkflow.usageOperationId
```

### 8.2 ContentCreationBriefV1

`ContentCreationBriefV1` 是跨服务的版本化业务契约。所有写入和读取都必须执行运行时校验。

```ts
type SupportedGenerationPlatform =
  | "wechat"
  | "weibo"
  | "xiaohongshu"
  | "douyin";

interface ContentCreationBriefV1 {
  schemaVersion: 1;
  id: string;
  workspaceId: string;
  projectId: string;
  revision: number;
  status: "baseline_ready" | "refining" | "ready" | "confirmed" | "archived";

  source: {
    type: "visibility_suggestion";
    suggestionId: string;
    sourceHash: string;
    auditId?: string;
    reportId?: string;
  };

  strategy: {
    objective: string;
    audience?: string;
    intent: string;
    contentType:
      | "faq"
      | "guide"
      | "comparison"
      | "case_study"
      | "thought_leadership"
      | "checklist"
      | "explainer";
  };

  editorial: {
    topic: string;
    titleCandidates: string[];
    outline: Array<{
      id: string;
      heading: string;
      purpose: string;
      evidenceRefs: string[];
    }>;
    keywords: string[];
    references: Array<{
      id: string;
      url: string;
      label?: string;
      source: "suggestion" | "project" | "user";
    }>;
    notes?: string;
  };

  platformPlan: Array<{
    platform: string;
    capability: "supported" | "unsupported";
    selected: boolean;
    reason?: string;
  }>;

  constraints: {
    locked: {
      mustMention: string[];
      avoidMention: string[];
      allowedClaims: string[];
      forbiddenClaims: string[];
      factualityPolicy: "verified_sources_only";
    };
    editable: {
      mustMention: string[];
      avoidMention: string[];
    };
  };

  generationMeta: {
    effectiveSource: "rules" | "llm" | "user";
    rulesVersion: string;
    promptVersion?: string;
    model?: string;
    fallbackReason?: string;
    refinementBaseRevision?: number;
  };

  createdAt: string;
  updatedAt: string;
}
```

### 8.3 字段长度与数量限制

| 字段 | 限制 |
|---|---:|
| 建议标题 `text` | 500 字符 |
| 建议描述、证据摘要、预期结果 | 每项 4,000 字符 |
| 来源数组 | 每类最多 20 项 |
| 来源 URL | 每项最多 2,048 字符，仅允许 HTTP/HTTPS |
| Brief 主题 | 200 字符 |
| 候选标题 | 最多 5 项，每项 120 字符 |
| 大纲 | 4 至 12 项 |
| 大纲标题 | 每项 120 字符 |
| 大纲目的 | 每项 800 字符 |
| 关键词 | 最多 20 项，每项 80 字符 |
| must/avoid/claim 数组 | 每类最多 20 项，每项 500 字符 |
| 备注 | 4,000 字符 |
| 单次跨服务 JSON | 最大 128 KiB |

超限输入不得静默截断后继续生成。Portal 应返回 `422 SOURCE_PAYLOAD_TOO_LARGE`，并记录字段名；用户可返回智见调整建议或由服务端按明确规则生成摘要后重新提交。

### 8.4 规范来源快照

ContentOS 内部保存的 `sourceSnapshot` 只允许以下字段：

```ts
interface VisibilitySuggestionSnapshotV1 {
  schemaVersion: 1;
  suggestionId: string;
  text: string;
  description?: string;
  category?: string;
  priority?: string;
  actionType?: string;
  typeTags: string[];
  keywords: string[];
  contentOutline?: string;
  evidenceSummary?: string;
  auditFindings: string[];
  acceptanceCriteria: string[];
  expectedResult?: string;
  successMetric?: string;
  measurementPlan?: string;
  evidenceSources: string[];
  actionSources: string[];
  requestedChannels: string[];
}
```

未知字段、访问令牌、Cookie、原始请求头和用户隐私信息不得进入快照、日志或 LLM 提示词。

### 8.5 Brief 合并优先级

从高到低：

1. 服务端锁定的事实与合规约束；
2. 用户确认或编辑的字段；
3. 通过质量校验的 LLM 提炼结果；
4. 规则生成的基础结果。

生成时使用 `locked` 与 `editable` 数组规范化去重后的并集。LLM 只能为 `editable` 提供候选值，不能写入 `locked`，也不能用空数组删除上级约束。`forbiddenClaims`、`factualityPolicy` 和项目边界只能由服务端策略更新。

### 8.6 ContentOS 数据模型草案

以下 Prisma 结构是实施参考，最终迁移名称按 ContentOS 规范确定。

```prisma
model ContentBrief {
  id                    String   @id @default(cuid())
  workspaceId           String
  projectId             String
  createdByUserId       String
  schemaVersion         Int      @default(1)
  revision              Int      @default(1)
  status                String   @default("baseline_ready")
  sourceType            String
  sourceSuggestionId    String
  sourceHash            String
  sourceSnapshot        Json
  projectSnapshot       Json
  baselineBrief         Json
  refinedCandidate      Json?
  effectiveBrief        Json
  generationMeta        Json
  idempotencyKey        String
  idempotencyRequestHash String
  refinementStatus      String   @default("queued")
  refinementAttempts    Int      @default(0)
  refinementLockedBy    String?
  refinementLockedUntil DateTime?
  refinementLastError   String?  @db.Text
  confirmedAt           DateTime?
  expiresAt             DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  workflows             ContentWorkflow[]

  @@unique([workspaceId, projectId, idempotencyKey])
  @@index([workspaceId, projectId, sourceSuggestionId])
  @@index([refinementStatus, refinementLockedUntil])
}

model ContentWorkflow {
  id                     String   @id @default(cuid())
  workspaceId            String
  projectId              String
  briefId                String
  brief                   ContentBrief @relation(fields: [briefId], references: [id])
  briefRevision          Int
  contentPieceId         String?  @unique
  usageOperationId       String   @unique
  idempotencyKey         String
  idempotencyRequestHash String
  status                 String   @default("queued")
  failureCode            String?
  failureMessage         String?  @db.Text
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt
  completedAt            DateTime?
  runs                    ContentGenerationRun[]

  @@unique([workspaceId, projectId, idempotencyKey])
  @@index([workspaceId, projectId, status])
}

model ContentGenerationRun {
  id               String   @id @default(cuid())
  workflowId       String
  workflow         ContentWorkflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  platform         String
  platformContentId String?
  status           String   @default("queued")
  attemptCount     Int      @default(0)
  lockedBy         String?
  lockedUntil      DateTime?
  startedAt        DateTime?
  completedAt      DateTime?
  failureCode      String?
  failureMessage   String?  @db.Text
  providerRequestId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([workflowId, platform])
  @@index([status, lockedUntil])
}
```

`ContentPiece.brief` 在兼容期继续写入 `effectiveBrief` 的 JSON 字符串，保证现有编辑器和提示词构建器可工作。同时新增可空的 `workflowId` 或通过 `ContentWorkflow.contentPieceId` 关联。完成迁移后，生成代码以 `ContentBrief` 为准，`ContentPiece.brief` 只保留快照用途。

### 8.7 Portal 额度模型扩展

在现有 `UsageEvent` 上增加：

```prisma
model UsageEvent {
  // existing fields omitted
  operationId  String?  @db.Text
  requestHash  String?  @db.Text
  status       String   @default("committed") @db.Text
  expiresAt    DateTime?

  @@index([workspaceId, feature, periodStart, status])
}
```

迁移使用部分唯一索引保证非空操作 ID 唯一：

```sql
CREATE UNIQUE INDEX usage_event_operation_unique
ON "UsageEvent" ("workspaceId", feature, "operationId")
WHERE "operationId" IS NOT NULL;
```

历史 UsageEvent 默认状态为 `committed`，不需要生成 operationId。

## 9. 状态机

### 9.1 Brief 状态

| 当前状态 | 事件 | 下一状态 | 说明 |
|---|---|---|---|
| `baseline_ready` | 提炼任务被领取 | `refining` | 基础 Brief 已可用 |
| `baseline_ready` | 用户编辑 | `ready` | revision + 1 |
| `refining` | 提炼成功且 revision 未变化 | `ready` | 应用 AI 结果 |
| `refining` | 提炼失败 | `ready` | 保留规则版并记录原因 |
| `refining` | 用户编辑 | `ready` | AI 结果完成后不得覆盖 |
| `ready` | 用户确认生成 | `confirmed` | 记录确认时间和 revision |
| 任意非归档状态 | 主动归档 | `archived` | 不允许创建新工作流 |

### 9.2 工作流状态

```text
queued ──► generating ──► succeeded
  │             │
  │             ├──────► partial ──► generating
  │             │
  │             └──────► failed ───► generating
  └────────────────────► cancelled
```

聚合规则：

- 全部平台 `succeeded`：工作流 `succeeded`；
- 至少一个成功且至少一个最终失败：`partial`；
- 全部平台最终失败：`failed`；
- 存在 `queued` 或 `generating`：工作流 `generating`；
- 只允许在没有任何平台发出模型请求前取消整个工作流。

### 9.3 平台运行状态

| 状态 | 是否可自动重试 | 说明 |
|---|---|---|
| `queued` | 不适用 | 等待 worker 领取 |
| `generating` | 租约过期后可恢复 | 已领取，可能正在调用模型 |
| `succeeded` | 否 | 已写入 PlatformContent |
| `failed_retryable` | 是 | 超时、限流、临时网络或 5xx |
| `failed_terminal` | 否 | 不支持的平台、契约错误、权限错误、不可恢复的输入错误 |
| `cancelled` | 否 | 生成前被取消 |

默认最多 3 次尝试，退避间隔为 5 秒、30 秒、120 秒，并加入随机抖动。人工点击重试不增加额度，但必须保留原工作流 ID。

## 10. API 契约

### 10.1 通用约定

- 浏览器只访问 Portal `/api/content/...`；
- Portal 使用项目级 service JWT 调用 Visibility 和 ContentOS；
- 所有写接口使用 `Idempotency-Key` 请求头；
- 同一个幂等键和相同请求哈希返回原结果；
- 同一个幂等键对应不同请求体返回 `409 IDEMPOTENCY_KEY_REUSED`；
- 错误响应统一包含 `error.code`、`error.message` 和 `requestId`；
- Portal 从鉴权上下文取得 workspace、project 和 user，不接受正文覆盖这些值。

### 10.2 创建来源 Brief

```http
POST /api/content/briefs/from-suggestion?projectId=project_123
Content-Type: application/json
```

请求必须携带新生成的 `Idempotency-Key` 请求头。

```json
{
  "suggestionId": "154"
}
```

成功响应：

```json
{
  "data": {
    "id": "brief_123",
    "projectId": "project_123",
    "revision": 1,
    "status": "baseline_ready",
    "brief": {
      "topic": "品牌如何提升 AI 搜索场景下的可见性与可信度",
      "titleCandidates": [],
      "outline": [
        {
          "id": "section_1",
          "heading": "目标用户正在遇到什么问题",
          "purpose": "用读者语言解释当前信息缺口",
          "evidenceRefs": []
        },
        {
          "id": "section_2",
          "heading": "为什么现有信息难以被准确理解",
          "purpose": "说明信息结构、证据和表达上的常见缺口",
          "evidenceRefs": []
        },
        {
          "id": "section_3",
          "heading": "可以采用哪些改进方法",
          "purpose": "给出基于已确认能力的可执行路径",
          "evidenceRefs": []
        },
        {
          "id": "section_4",
          "heading": "如何判断改进是否有效",
          "purpose": "说明评估指标和后续观察方式",
          "evidenceRefs": []
        }
      ],
      "keywords": ["AI 搜索", "品牌可见性"],
      "references": [],
      "notes": "只使用已确认资料，不编造数据或案例"
    },
    "platformPlan": [
      {
        "platform": "zhihu",
        "capability": "unsupported",
        "selected": false,
        "reason": "当前暂不支持知乎自动生成"
      }
    ],
    "refinement": {
      "status": "queued"
    }
  },
  "meta": {
    "replayed": false
  }
}
```

状态码：

| 状态码 | 错误码 | 场景 |
|---:|---|---|
| 201 | 无 | 新 Brief 创建成功 |
| 200 | 无 | 幂等重放，返回原 Brief |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | 缺少幂等键 |
| 404 | `SUGGESTION_NOT_FOUND` | 当前项目内不存在该建议 |
| 409 | `IDEMPOTENCY_KEY_REUSED` | 相同键请求体不同 |
| 422 | `SUGGESTION_NOT_CONTENT_ELIGIBLE` | 明确不适合转成内容 |
| 422 | `SOURCE_PAYLOAD_INVALID` | 建议字段不合法或超限 |
| 502 | `VISIBILITY_UNAVAILABLE` | 智见服务暂不可用 |
| 503 | `CONTENT_SERVICE_UNAVAILABLE` | ContentOS 暂不可用 |

### 10.3 获取 Brief

```http
GET /api/content/briefs/brief_123?projectId=project_123
```

Portal 必须验证 Brief 的 `workspaceId + projectId` 与当前上下文一致。响应不得包含完整 `sourceSnapshot`，仅返回 `source.suggestionId`、审计 ID、报告 ID和可供用户理解的来源标签。

### 10.4 更新 Brief

```http
PATCH /api/content/briefs/brief_123?projectId=project_123
Content-Type: application/json
```

请求必须携带本次编辑操作的 `Idempotency-Key` 请求头。

```json
{
  "expectedRevision": 2,
  "editorial": {
    "topic": "更新后的主题",
    "titleCandidates": ["候选标题一"],
    "outline": [],
    "keywords": ["AI 搜索"],
    "references": [],
    "notes": "保持客观，不使用未经证实的数据"
  },
  "selectedPlatforms": ["wechat"]
}
```

可编辑字段仅限 `strategy` 的用户可见部分、`editorial`、`selectedPlatforms` 以及 `constraints.editable`。项目归属、来源、`constraints.locked` 和生成元数据不可编辑。

`expectedRevision` 与当前版本不一致时返回 `409 BRIEF_VERSION_CONFLICT`，并返回当前 revision，前端提示用户重新加载，禁止静默覆盖。

### 10.5 创建内容工作流

```http
POST /api/content/workflows?projectId=project_123
Content-Type: application/json
```

请求必须携带本次工作流操作的 `Idempotency-Key` 请求头。

```json
{
  "briefId": "brief_123",
  "briefRevision": 3,
  "platforms": ["wechat", "xiaohongshu"],
  "templateId": "template_123",
  "brandVoiceId": "voice_123"
}
```

Portal 执行顺序：

1. 校验 Brief 属于当前 workspace/project；
2. 校验 revision、平台能力、模板和品牌声音归属；
3. 使用 `operationId = content-workflow:<workspaceId>:<sha256(idempotencyKey)>` 预占额度，日志只记录 operationId，不记录原始幂等键；
4. 调用 ContentOS 创建工作流；
5. 返回 202；
6. 若 ContentOS 返回明确 4xx，释放预占；若结果不确定，进入对账。

成功响应：

```json
{
  "data": {
    "id": "workflow_123",
    "briefId": "brief_123",
    "briefRevision": 3,
    "contentPieceId": "content_123",
    "status": "queued",
    "platforms": [
      { "platform": "wechat", "status": "queued" },
      { "platform": "xiaohongshu", "status": "queued" }
    ]
  },
  "meta": {
    "replayed": false
  }
}
```

### 10.6 查询工作流

```http
GET /api/content/workflows/workflow_123?projectId=project_123
```

```json
{
  "data": {
    "id": "workflow_123",
    "contentPieceId": "content_123",
    "status": "partial",
    "platforms": [
      { "platform": "wechat", "status": "succeeded" },
      {
        "platform": "xiaohongshu",
        "status": "failed_retryable",
        "error": {
          "code": "LLM_TIMEOUT",
          "message": "小红书内容生成超时，可以重试"
        }
      }
    ]
  }
}
```

### 10.7 重试单个平台

```http
POST /api/content/workflows/workflow_123/platforms/xiaohongshu/retry?projectId=project_123
```

请求必须携带本次重试操作的 `Idempotency-Key` 请求头。

约束：

- 只允许重试 `failed_retryable` 或经管理员确认可恢复的 `failed_terminal`；
- 已成功的平台不得覆盖；
- 同一个 retry 幂等键只增加一次 attempt；
- 不新增 UsageEvent；
- 返回 202 和最新工作流状态。

### 10.8 ContentOS 到 Portal 的额度回调

```http
POST /api/internal/content-usage/operations/{operationId}/commit
```

该内部请求使用 ContentOS audience 的 service JWT，并以 `{operationId}:commit` 作为幂等键。

ContentOS worker 必须在第一次调用内容模型之前获得成功或幂等成功响应。Portal 不可用时，任务保持 `queued` 或 `failed_retryable`，不得绕过计费继续生成。

取消或输入永久失败时使用对应的 `/release` 接口。提交后的额度不能释放。

### 10.9 平台能力接口

ContentOS 提供内部接口：

```http
GET /api/capabilities/content-generation
```

```json
{
  "schemaVersion": 1,
  "platforms": {
    "wechat": { "enabled": true, "maxConcurrent": 2 },
    "weibo": { "enabled": true, "maxConcurrent": 2 },
    "xiaohongshu": { "enabled": true, "maxConcurrent": 2 },
    "douyin": { "enabled": true, "maxConcurrent": 2 },
    "zhihu": { "enabled": false, "reason": "generator_not_implemented" },
    "toutiao": { "enabled": false, "reason": "generator_not_implemented" }
  }
}
```

Portal 可缓存 60 秒。能力接口不可用时使用编译期保守快照，只开放已确认的四个平台。

## 11. 建议到 Brief 的转换策略

### 11.1 内容适配判定

目标状态：智见建议直接提供以下字段：

```ts
contentEligible: boolean;
contentAssetType?: "faq" | "guide" | "comparison" | "explainer" | "checklist";
editorialObjective?: string;
```

在智见完成升级前，ContentOS 使用版本化规则表，而不是散落的正则表达式：

| 规则优先级 | 信号 | 内容类型 | 处理 |
|---:|---|---|---|
| 100 | 发布、文章、FAQ、问答、指南、对比页、百科内容 | 对应内容类型 | 可创建 |
| 90 | 引用、推荐、品牌可见性且包含内容渠道或来源 | explainer/guide | 可创建 |
| 50 | 信号混合或缺少目标读者 | 待确认 | 生成基础 Brief，要求用户确认 |
| 0 | 权限、部署、接口、账号、投放配置等纯技术/运营任务 | 无 | 返回 422，不创建 Brief |

规则表必须具有 `rulesVersion`，并对重叠规则显式定义优先级。

### 11.2 规则版 Brief

规则版必须完成“任务语言到读者语言”的转换：

| 内部输入 | 不能直接生成 | 应转换为 |
|---|---|---|
| 建立百度百科词条获得引用 | 同名主题 | 品牌是什么、定位、能力和应用场景 |
| DeepSeek 未引用自有内容 | 审计结论 | 用户如何判断信息可信度、品牌如何提供可引用资料 |
| 发布 FAQ 页面 | 执行任务 | 目标用户最关心的问题和回答结构 |
| 提升引用率到 60% | 对外承诺 | 发布后的内部观察指标，不能写进正文结论 |

### 11.3 LLM 提炼输入

LLM 只接收：

- 规范建议快照；
- 项目和产品快照；
- 规则版 Brief；
- 平台能力；
- 明确的 JSON 输出结构；
- 不可覆盖的事实与合规规则。

禁止模型联网补充来源。允许引用的 URL 必须来自白名单。输出 token 上限建议为 2,000，温度不高于 0.2，单次硬超时 45 秒。

### 11.4 LLM 输出质量门

模型结果必须同时满足：

1. JSON 结构合法且字段在长度范围内；
2. 主题非空，大纲 4 至 12 项；
3. 平台全部存在于能力契约；
4. 引用 URL 全部存在于允许列表；
5. 不完整复制任何内部来源字段；
6. 不包含“优化建议、审计发现、验收标准、任务完成”等内部执行话术；
7. 不删除项目名称、产品关键词和事实边界；
8. 不新增来源中不存在的数字、案例、认证、价格或客户名称；
9. 主题、大纲之间不存在明显重复；
10. 与规则版主题保持相同业务目标，不生成无关行业泛文。

来源重叠检测先规范化空白、标点和大小写，再对长度不少于 12 个字符的片段执行连续匹配与相似度检测。短通用词不作为失败依据，避免误判。

## 12. 幂等、一致性与并发

### 12.1 请求哈希

所有幂等接口使用稳定 JSON 序列化后计算 SHA-256。哈希范围必须排除时间戳和 requestId，包含所有会改变业务结果的字段。

```text
same key + same owner + same hash     = replay
same key + same owner + different hash = 409
same key + different owner             = independent namespace
```

Owner 范围为 `workspaceId + projectId + userId`。数据库唯一约束至少包含 workspace 和 project，查询时必须再验证 user 权限。

### 12.2 Brief 并发编辑

使用乐观锁：

```sql
UPDATE ContentBrief
SET revision = revision + 1, effectiveBrief = ?
WHERE id = ? AND revision = ?;
```

影响行数为 0 时返回 409。禁止后写覆盖先写。

### 12.3 额度预占并发

Portal 在 PostgreSQL `Serializable` 事务中执行：

1. 按 operationId 查找已有记录；
2. 统计本周期 `reserved + committed` 数量；
3. 校验套餐上限；
4. 插入 `reserved` UsageEvent；
5. 序列化冲突最多重试 3 次。

这样可以避免两个并发请求都在额度剩余 1 次时通过检查。

### 12.4 Worker 租约

Worker 使用条件更新领取任务：

```text
status in (queued, failed_retryable)
AND (lockedUntil is null OR lockedUntil < now)
```

领取后设置 `lockedBy` 和 `lockedUntil`。生成期间每 30 秒续租；默认租约 5 分钟。Worker 崩溃后，其他实例可以在租约到期后接管。

如果供应商支持请求幂等键，使用 `workflowId:platform:attempt`。如果不支持，租约接管前先查询已保存的 `providerRequestId` 或结果，无法确认时标记 `needs_review`，不得盲目再次调用造成重复消耗。

### 12.5 跨服务 Saga

这里不使用分布式事务，采用可对账的 Saga：

```text
reserve usage
  ↓
create workflow
  ├─ definite rejection → release
  ├─ accepted           → wait for worker commit
  └─ ambiguous timeout  → pending_reconcile
```

Portal 每分钟对账超过 2 分钟的 `pending_reconcile`：

- ContentOS 存在 workflow：保持预占或按 workflow 状态提交；
- ContentOS 明确不存在：释放；
- ContentOS 不可用：保留并告警，不能猜测释放。

## 13. 错误与恢复

### 13.1 错误分类

| 类别 | 示例 | 用户行为 | 系统行为 |
|---|---|---|---|
| 输入错误 | Brief 版本冲突、不支持平台 | 修改后重试 | 不自动重试，不扣额 |
| 权限错误 | 项目不匹配、Brief 不属于用户工作区 | 返回项目或重新登录 | 不创建任何记录 |
| 临时依赖错误 | Visibility/ContentOS 5xx、网络超时 | 稍后重试 | 幂等重放或后台重试 |
| LLM 临时错误 | 限流、超时、5xx | 等待或重试失败平台 | 最多自动重试 3 次 |
| LLM 输出错误 | JSON 不合法、事实越界 | 使用规则版或修改 Brief | Brief 提炼回退；正文生成记为可恢复或终止 |
| 对账不确定 | 创建响应丢失 | 无需重复点击 | 使用 operationId 查询并恢复 |

### 13.2 超时预算

| 调用 | 超时 | 重试 |
|---|---:|---|
| Portal → Visibility 读取建议 | 5 秒 | 1 次，仅连接错误/5xx |
| Portal → ContentOS 创建/读取 Brief | 5 秒 | 1 次，复用幂等键 |
| Portal → ContentOS 创建工作流 | 5 秒 | 1 次，复用幂等键 |
| Brief LLM 提炼 | 45 秒 | 最多 2 次后台重试 |
| 单平台内容生成 | 180 秒 | 最多 3 次，按错误分类 |
| 浏览器查询状态 | 单次 10 秒 | 客户端退避轮询 |

流式代理的超时必须覆盖响应体整个生命周期，不能在收到响应头时清除。客户端断开只取消转发，不取消已经持久化并被 worker 领取的任务。

### 13.3 用户可见提示

| 场景 | 推荐文案 |
|---|---|
| 规则版先返回 | 已生成基础创作方案，你可以直接完善并开始创作 |
| AI 提炼完成 | 创作方案已根据建议完成提炼 |
| AI 提炼失败 | 已保留可用的基础创作方案，你可以继续编辑 |
| 平台不支持 | 当前暂不支持知乎自动生成，请选择其他平台 |
| 部分平台失败 | 2 个平台已生成，1 个平台暂未完成，可单独重试 |
| 版本冲突 | 创作方案已在其他页面更新，请刷新后继续 |
| 内容服务暂不可用 | 创作任务尚未提交，请稍后重试，不会重复扣除额度 |
| 状态不确定 | 请求正在确认中，请勿重复提交 |

所有文案从客户任务出发，不暴露内部服务名、数据库状态或技术堆栈。

## 14. 安全与隐私

1. 浏览器不能提交 `workspaceId`、规范建议正文、锁定约束或 `sourceHash` 作为可信字段。
2. 每次读取 Brief、工作流和内容都重新验证 workspace/project 权限。
3. ContentOS service JWT 必须包含 workspace、project、user、role、audience 和短有效期。
4. 内部额度回调只接受 ContentOS audience 的 service JWT。
5. 日志不得记录完整建议正文、产品描述、访问令牌、Cookie 或 LLM 完整提示词。
6. 日志可记录字段长度、hash、ID、规则版本、模型、状态和错误码。
7. URL、前端埋点和浏览器历史中只能出现不透明 ID。
8. 参考 URL 只允许 HTTP/HTTPS；拒绝 `file:`、`javascript:`、内网地址和包含用户凭证的 URL。
9. LLM 输入执行长度限制和字符规范化，降低提示注入和成本放大风险。
10. `sourceSnapshot` 不对浏览器完整返回；管理员排障访问需要单独权限和审计日志。

## 15. 可观测性

### 15.1 关联字段

所有结构化日志和指标使用：

```text
requestId
workspaceId
projectId
suggestionId
briefId
briefRevision
workflowId
contentPieceId
platform
operationId
rulesVersion
promptVersion
model
```

正文、建议原文和完整提示词不是关联字段。

### 15.2 关键事件

```text
content_brief.baseline_created
content_brief.refinement_started
content_brief.refinement_succeeded
content_brief.refinement_fallback
content_brief.user_updated
content_workflow.created
content_workflow.usage_committed
content_generation.started
content_generation.succeeded
content_generation.failed
content_generation.retried
content_workflow.completed
content_usage.reconcile_required
content_usage.reconciled
```

### 15.3 指标与告警

| 指标 | 告警建议 |
|---|---|
| Brief 创建失败率 | 5 分钟 > 2% |
| AI 提炼回退率 | 30 分钟 > 20% |
| Brief 来源文本重叠率 | P95 突增 50% |
| 工作流排队时间 | P95 > 60 秒 |
| 平台生成失败率 | 单平台 15 分钟 > 10% |
| 租约接管次数 | 10 分钟 > 5 次 |
| `pending_reconcile` 数量 | 任意记录超过 10 分钟 |
| 重复 content/operation 约束冲突 | 任意非测试环境事件 |
| reserved 额度超时 | 任意记录超过 30 分钟 |
| 平台契约不一致 | 任意事件立即告警 |

质量指标包括用户修改距离、AI 与来源重叠率、规则回退率、Brief 接受率和生成后删除率。修改距离用于判断提炼效果，不用于限制用户操作。

## 16. 前端设计

### 16.1 智创内容概览页

- “AI 生成”按钮只发送 suggestionId；
- 点击后按钮进入“正在准备创作方案”；
- 收到 briefId 后立即跳转；
- 重复点击复用当前操作的幂等键；
- 请求状态不确定时显示“正在确认”，禁止生成第二个键。

### 16.2 新建内容页

页面按 briefId 加载，展示：

- 内容主题；
- 候选标题；
- 创作目的和读者意图；
- 内容结构；
- 关键词和参考资料；
- 必须提及与需要避免；
- 平台能力及不可用原因；
- AI 提炼状态；
- 来源提示，例如“来自智见建议 #154”。

当全局项目发生切换且与 Brief 项目不同，页面必须停止编辑并提示返回原项目，不能把 Brief 自动迁移到新项目。

### 16.3 生成进度页

提交工作流后跳转到：

```text
/content/workflows/{workflowId}
```

页面显示每个平台的排队、生成、完成和失败状态。已有成功平台允许直接进入编辑器；失败平台显示可执行的重试按钮。

## 17. 代码改造范围

### 17.1 GeniLink Portal

建议新增或调整：

```text
src/contracts/content-creation-brief-v1.ts
src/lib/content/canonical-suggestion.ts
src/lib/content/contentos-brief-client.ts
src/lib/content/content-workflow-client.ts
src/lib/billing/usage-reservations.ts
src/app/api/content/briefs/from-suggestion/route.ts
src/app/api/content/briefs/[id]/route.ts
src/app/api/content/workflows/route.ts
src/app/api/content/workflows/[id]/route.ts
src/app/api/content/workflows/[id]/platforms/[platform]/retry/route.ts
src/app/api/internal/content-usage/operations/[operationId]/commit/route.ts
src/app/api/internal/content-usage/operations/[operationId]/release/route.ts
```

需要移除：

- 浏览器提交完整 suggestion；
- `contentBriefToSearchParams` 与 `parseContentBriefSearchParams` 的业务传递用途；
- Brief 转换阶段的 `content_generation` 扣额；
- 新建页直接调用 `/api/content` 后再调用 `/generate`；
- Portal 端逐平台串行等待响应体。

规范建议读取逻辑应从现有 suggestions `[id]` 路由提取为服务端函数，API 展示和 Brief 创建共用同一套映射与项目校验。

### 17.2 ContentOS

建议新增或调整：

```text
src/contracts/content-creation-brief-v1.ts
src/lib/content-brief/baseline-generator.ts
src/lib/content-brief/refinement.ts
src/lib/content-workflow/service.ts
src/lib/content-workflow/worker.ts
src/app/api/content-briefs/route.ts
src/app/api/content-briefs/[id]/route.ts
src/app/api/content-workflows/route.ts
src/app/api/content-workflows/[id]/route.ts
src/app/api/content-workflows/[id]/platforms/[platform]/retry/route.ts
src/app/api/internal/content-workflows/run/route.ts
src/app/api/capabilities/content-generation/route.ts
```

需要调整：

- `Brief` 保存完整 `GenerationContext`；
- `ContentPiece.brief` 兼容写入完整有效 Brief；
- 生成提示词必须消费 `mustMention`、`avoidMention`、claims 和来源；
- 平台 normalize 遇到不支持的值返回 422，禁止默认微信；
- 生成从请求同步调用改为数据库任务；
- worker 使用租约、分平台状态和有限并发。

### 17.3 智见 Visibility Service

后续建议增加：

```text
contentEligible
contentAssetType
editorialObjective
suggestionRevision 或 updatedAt
```

Portal 在这些字段上线前继续计算规范 `sourceHash`。字段上线后，`sourceHash` 仍保留，用于发现相同 revision 下内容意外变化。

## 18. 契约管理

两个仓库各保存同名 JSON Schema：

```text
contracts/content-creation-brief-v1.schema.json
contracts/content-workflow-v1.schema.json
contracts/content-platform-capabilities-v1.schema.json
```

Portal 负责消费者契约测试，ContentOS 负责提供者契约测试。CI 必须验证：

1. Schema 文件内容 hash 一致；
2. TypeScript 类型由 Schema 生成或通过测试证明一致；
3. 示例请求与响应通过 Schema；
4. 平台枚举一致；
5. 新增必填字段必须升级 schemaVersion，不能直接破坏 V1。

如果暂时不能建立共享包，Schema hash 检查是最低要求。长期可以建立独立 contracts 包，但不作为第一版前置条件。

## 19. 测试方案

### 19.1 单元测试

Portal：

- 只接受 suggestionId，忽略或拒绝完整 suggestion；
- 规范建议必须属于当前 project；
- 所有字段长度和数组上限；
- 内容适配规则优先级和混合信号；
- URL 过滤、内网 URL 和非法协议；
- 幂等 replay 与冲突；
- 额度 reserve/commit/release；
- Serializable 冲突重试；
- 项目切换保护。

ContentOS：

- 规则版主题和大纲的黄金样例；
- 百度百科、FAQ、对比、可见性等类型；
- 不复制所有内部来源字段；
- LLM 结果不能删除硬约束；
- 用户编辑后迟到的提炼结果不能覆盖；
- 不支持平台返回 422；
- 工作流聚合状态；
- 租约领取、续约和接管；
- 平台重试不覆盖成功结果；
- 同一幂等键只创建一个 ContentPiece。

### 19.2 黄金样例

至少维护以下样例：

| 输入类型 | 预期内容类型 | 必须断言 |
|---|---|---|
| 建立百度百科词条获得 DeepSeek 引用 | explainer | 不出现任务原句；主题为品牌定位和能力 |
| 发布 FAQ 提升推荐覆盖 | faq | 大纲为用户问题，不是验收清单 |
| 创建竞品对比页 | comparison | 只允许客观维度，不贬损或编造 |
| 提升引用率到 60% | guide/explainer | 60% 只进入内部观察指标 |
| 配置平台授权 | ineligible | 返回 422，不创建 Brief |
| 知乎发布建议 | requires confirmation | 显示不支持，不自动改微信 |

### 19.3 跨服务集成测试

1. suggestionId → Visibility 规范建议 → ContentOS Brief；
2. Brief 的全部约束进入 `ContentPiece.brief` 和生成提示词；
3. 同一请求重放只产生一个 Brief；
4. 工作流超时后按 operationId 找回原结果；
5. 两个并发请求争抢最后一次额度时只有一个成功；
6. commit 回调失败时不向 LLM 发请求；
7. ContentOS 创建成功但 Portal 响应丢失时，对账能恢复；
8. 四个平台契约完全一致。

### 19.4 E2E

- 登录用户从智创概览点击一条智见建议；
- 3 秒内进入带基础 Brief 的创建页；
- AI 提炼失败时仍可编辑和提交；
- 修改 Brief 并选择两个平台；
- 模拟一个平台成功、一个平台失败；
- 页面显示部分成功，重试失败平台；
- 最终只有一个 ContentPiece、两个 PlatformContent 和一个 UsageEvent；
- 切换项目后无法继续使用原 Brief；
- 刷新和重复点击不会重复创建或扣额。

### 19.5 故障注入

- Visibility 连接超时；
- ContentOS 创建响应在服务端提交后中断；
- LLM 返回非法 JSON；
- LLM 响应体停滞；
- Worker 在模型请求前、请求后和写库前退出；
- Portal 额度回调暂时不可用；
- 数据库死锁或序列化冲突；
- 租约到期后第二个 worker 接管；
- 重试按钮被快速点击多次。

## 20. 实施计划

### Phase 0：冻结契约与能力

交付物：

- 三份 V1 JSON Schema；
- 平台能力接口；
- ContentOS 四平台严格校验；
- 契约测试进入两个仓库 CI；
- 功能开关 `CONTENT_BRIEF_WORKFLOW_V1`，默认关闭。

退出条件：两个仓库对相同示例和平台枚举测试通过。

### Phase 1：持久化 Brief

交付物：

- ContentOS ContentBrief 表和 API；
- Portal 规范建议 loader；
- 浏览器只提交 suggestionId；
- 基础规则转换器迁移到 ContentOS；
- `/content/new?briefId=...`；
- 项目绑定、版本编辑和完整约束展示；
- 旧 URL 入口只保留兼容读取，不再生成新链接。

退出条件：规则版在 LLM 完全不可用时仍可完成创建前确认，且 URL 不包含业务正文。

### Phase 2：异步提炼

交付物：

- Brief 提炼 worker 与租约；
- 结构、来源重叠和事实边界质量门；
- 用户编辑防覆盖；
- 提炼状态和可观测性。

退出条件：所有失败场景保留可用基础 Brief，没有请求阻塞 45 秒。

### Phase 3：工作流与额度

交付物：

- ContentWorkflow、ContentGenerationRun；
- Portal 额度预占/提交/释放和内部回调；
- ContentPiece 与平台任务事务创建；
- 平台级有限并发、状态和重试；
- pending_reconcile 对账任务；
- 移除浏览器两阶段生成。

退出条件：重复点击、响应丢失、worker 崩溃和部分平台失败测试全部通过。

### Phase 4：灰度迁移

1. 先部署 ContentOS 的兼容数据库和新 API；
2. 验证旧 Portal 仍能使用旧接口；
3. 部署 Portal，但保持开关关闭；
4. 内部项目开启 10% 灰度；
5. 检查 24 小时 Brief 回退率、重复率、额度对账和失败恢复；
6. 扩大至 50%，再运行 24 小时；
7. 全量启用；
8. 稳定一个发布周期后停止创建旧 URL Brief；
9. 再稳定一个发布周期后删除旧浏览器编排代码。

部署顺序必须为 ContentOS 在前、Portal 在后。每个仓库分别通过本地 gate、PR CI 和正式发布流程。

## 21. 回滚策略

### 21.1 应用回滚

- 新表和新增字段在兼容期只增不删；
- Portal 开关关闭后恢复旧入口，但不得回滚数据库迁移；
- ContentOS 新 API 在 Portal 完全回滚前保持兼容；
- 已创建的新工作流继续由新 worker 完成，不能因前端回滚而丢弃；
- 回滚后禁止创建新的 V1 工作流，但允许查询已有状态。

### 21.2 数据回滚

不对已生成内容做自动删除。异常工作流标记 `needs_review`，由管理员确认重试、终止或保留。UsageEvent 只通过补偿状态转换处理，禁止直接删除账本记录。

### 21.3 开关

| 开关 | 作用 |
|---|---|
| `CONTENT_BRIEF_WORKFLOW_V1` | Portal 是否使用 briefId 链路 |
| `CONTENT_BRIEF_ASYNC_REFINEMENT` | 是否启用 AI 异步提炼 |
| `CONTENT_GENERATION_WORKER_V1` | 是否由 worker 执行平台生成 |
| `CONTENT_USAGE_RESERVATION_V1` | 是否启用额度预占和回调 |

开关依赖顺序与表中顺序一致，不允许后置能力在前置能力关闭时单独开启。

## 22. 验收标准

### 22.1 功能验收

- [ ] 浏览器请求中不包含完整建议对象；
- [ ] Portal 从当前项目重新读取规范建议；
- [ ] 新建页 URL 只包含 briefId；
- [ ] Brief 完整显示创作目的、结构、来源和约束；
- [ ] LLM 不可用时规则版仍可使用；
- [ ] LLM 结果不会覆盖用户修改或硬约束；
- [ ] 不支持平台明确提示且不能提交；
- [ ] 一次工作流只创建一个 ContentPiece；
- [ ] 多平台部分失败可以单独重试；
- [ ] 刷新、双击和网络重试不重复创建；
- [ ] 同一工作流只产生一条有效额度记录；
- [ ] 项目切换后不能读取或提交其他项目 Brief。

### 22.2 工程验收

- [ ] 两个仓库契约 hash 和消费者/提供者测试通过；
- [ ] 数据库迁移支持前后版本并行；
- [ ] Worker 租约、崩溃接管和最大尝试次数经过测试；
- [ ] 所有外部调用有全生命周期超时；
- [ ] 结构化日志包含完整关联 ID，不包含业务正文和密钥；
- [ ] 额度对账无超过 10 分钟的未决记录；
- [ ] 灰度期间重复内容和重复扣额均为 0；
- [ ] ContentOS 先部署、Portal 后部署，并完成组合 smoke test；
- [ ] 回滚演练能够关闭新入口并继续查询已创建工作流。

### 22.3 客户体验验收

- [ ] 用户看到的是可创作主题和内容结构，不是智见内部任务原文；
- [ ] 用户在 3 秒内进入可编辑的基础方案；
- [ ] 页面明确告诉用户哪些平台成功、失败或尚不支持；
- [ ] 错误提示说明下一步操作，不暴露内部服务实现；
- [ ] 用户无需因为超时反复点击，也不会因此产生重复内容或重复扣额。

## 23. 开发任务拆分

建议按可独立评审的 PR 拆分：

| PR | 仓库 | 内容 | 依赖 |
|---:|---|---|---|
| 1 | ContentOS | V1 Schema、平台能力接口、严格平台校验 | 无 |
| 2 | Portal | V1 Schema 消费者测试、规范建议 loader | PR 1 契约 |
| 3 | ContentOS | ContentBrief 数据模型、基础转换和 CRUD | PR 1 |
| 4 | Portal | brief-from-suggestion BFF、briefId 页面 | PR 2、3 |
| 5 | ContentOS | 异步提炼、质量门、用户编辑防覆盖 | PR 3 |
| 6 | Portal | UsageEvent 预占、提交、释放和对账 | 无 |
| 7 | ContentOS | Workflow、平台运行、worker、额度回调 | PR 3、6 |
| 8 | Portal | 工作流 UI、状态查询、平台重试 | PR 7 |
| 9 | 两仓库 | 故障注入、E2E、灰度指标与运行手册 | 前述全部 |

每个 PR 都应保持向后兼容并独立通过各自的 `release:check`。跨仓库联调在 ContentOS 新接口部署到测试环境后进行。

## 24. 设计取舍

### 24.1 为什么不继续使用 URL 参数

URL 参数实现简单，但不能可靠承载版本、归属、来源和约束，也无法安全处理刷新、历史记录和跨项目切换。持久化 Brief 增加了一张表和 CRUD，却换来了稳定身份、权限校验、恢复和审计能力。

### 24.2 为什么不让浏览器直接调用两个服务

浏览器无法安全完成跨服务幂等、额度对账和不确定结果恢复。Portal 作为 BFF 统一鉴权和编排，浏览器只处理用户交互。

### 24.3 为什么先返回规则版

用户需要的是可继续工作的创作方案，而不是等待某个模型。规则版提供确定性和低延迟，AI 提炼提升表达质量，两者分离后任一模型故障都不会阻断主流程。

### 24.4 为什么使用数据库任务而不是外部队列

ContentOS 已使用关系数据库且当前没有消息队列依赖。数据库任务配合条件领取、租约和索引足以支撑第一版规模，也降低发布复杂度。若排队量或吞吐超过单库扫描能力，再迁移到消息队列；领域状态和幂等规则保持不变。

### 24.5 为什么不立即开放六个平台

“界面可选择”不等于“生成能力存在”。第一版按真实实现开放四个平台，避免错误降级和线上失败。新增平台通过能力契约上线，客户看到的选择始终与后端实际能力一致。

## 25. 完成定义

当以下条件同时满足时，链路才视为完成：

1. 数据契约、API、状态机和额度语义均已实现，而非只有转换文案；
2. Portal 与 ContentOS 的发布版本通过跨服务契约测试；
3. 故障注入证明断网、超时、重复提交和 worker 崩溃可恢复；
4. 灰度监控证明没有重复内容、重复扣额和跨项目读取；
5. 客户从建议进入内容创建时看到经过提炼的创作方案，并能理解和控制最终生成结果；
6. 正式运行手册包含部署顺序、开关、对账、告警和回滚步骤。
