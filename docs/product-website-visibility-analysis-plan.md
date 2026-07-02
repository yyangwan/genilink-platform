# 项目产品网站可见性分析评估方案

更新时间：2026-06-30

## 1. 背景与目标

当前 `genilink-platform` 已具备项目、产品信息、品牌关联、订阅校验和可见性审计入口，但可见性审计核心能力主要通过 `VISIBILITY_SERVICE_URL` 代理到外部 `geo-visibility-analyze` 服务。另一个项目 `geo-cn` 的方案提供了网站 HTML 抓取、语义结构分析、AI 友好度评分、优化建议、报告和 PDF 的完整后端设计。

本功能要解决的问题是：对项目绑定的产品网站进行一次可见性分析评估，判断该产品网站是否容易被 AI 搜索、大模型问答和传统搜索理解、引用和推荐，并给出可执行的优化建议。

核心目标：

- 基于项目已有 `url`、`productName`、`productKeywords`、`productDescription`、`productUrl` 生成产品网站分析任务。
- 复用现有鉴权、工作区、项目归属和 billing guard。
- 复用或扩展外部 visibility 服务的审计链路，避免在平台侧重复实现大型抓取/分析引擎。
- 输出可落库、可查询、可前端展示、可后续生成报告的分析结果。
- 第一版优先做到稳定、可恢复、可追踪，不做公开免费分析、支付解锁和独立 PDF 售卖。

非目标：

- 不在第一版引入新的分布式队列平台。
- 不在平台侧直接复制 `geo-cn` 的 MySQL 后端结构。
- 不重写现有 visibility 页面和 audit 状态体系。
- 不把公开站点免费检测、匿名支付报告作为第一版范围。

## 2. 当前项目约束

### 2.1 平台侧现状

当前项目是 Next.js + Prisma/Postgres：

- `Project` 已有产品字段：`url`、`industry`、`productName`、`productKeywords`、`productDescription`、`productUrl`。
- `Brand` 与 `ProjectBrand` 已能表达自有品牌和竞品。
- `src/lib/proxy/route-guard.ts` 统一完成 auth、workspace、billing、project 验证，并签发项目级 visibility JWT。
- `src/app/api/integration/audits/route.ts` 创建审计时会把项目关联品牌传给上游 visibility 服务。
- `src/app/api/integration/prompts/generate/route.ts` 已把产品上下文传给上游 prompt 生成接口。
- `src/app/api/integration/audit-status/route.ts` 通过 SSE 代理上游审计状态。

### 2.2 参考项目能力

`geo-cn/docs/backend-ai-visibility-design.md` 中的可复用能力包括：

- 网站抓取：多策略抓取 HTML、有效 HTML 判断、抓取日志。
- 页面解析：metadata、heading 结构、主体内容、Schema、链接。
- AI 语义分析：实体、关系、主题、内容结构。
- 评分：结构、语义、信息密度、权威性、技术 SEO、可读性。
- 建议：按维度输出优化建议和行动计划。
- 报告：完整报告摘要、PDF。
- 引用检测：Perplexity、ChatGPT、Google AI/Gemini 等平台引用检测。

但参考项目使用 Next.js Route Handlers + MySQL，与本项目的 Prisma/Postgres 和外部 visibility 服务代理架构不同，因此不能照搬数据层。

## 3. 推荐总体方案

采用“平台侧编排 + visibility 服务执行 + 平台侧展示”的方案。

```text
用户在项目内发起产品网站分析
  |
  v
genilink-platform API
  - 校验登录、工作区、订阅、项目归属
  - 读取项目产品上下文
  - 标准化目标 URL
  - 调用 visibility 服务
  |
  v
geo-visibility-analyze 服务
  - 创建 product website analysis run
  - 抓取 HTML
  - 抽取结构/元数据/Schema/实体/主题
  - 评分与建议生成
  - 落库状态、结果和事件
  |
  v
genilink-platform
  - 查询结果
  - SSE/轮询展示进度
  - 在项目页/visibility 页展示报告
```

第一版不建议把 HTML 抓取和 LLM 分析直接放进 `genilink-platform`，原因：

- 当前平台侧主要承担门户、权限、订阅和代理职责，长任务和外部平台调用已在 visibility 服务侧。
- 网站抓取涉及 SSRF 防护、超时、重试、日志、HTML 清洗和 LLM 成本控制，更适合放在已有审计服务。
- 现有页面和接口已经围绕 `/api/integration/**` 与上游服务协作。

## 4. 功能边界

### 4.1 第一版必须有

1. 分析入口

- 在项目维度发起产品网站分析。
- 默认目标 URL 优先级：`project.productUrl` > `project.url`。
- 请求时允许用户覆盖 URL，但必须仍落在当前项目上下文内。

2. 产品上下文

传给上游服务的上下文至少包括：

- `project_id`
- `project_name`
- `project_url`
- `industry`
- `product_name`
- `product_keywords`
- `product_description`
- `product_url`
- 自有品牌与别名
- 竞品品牌与别名

3. 网站分析结果

结果应包含：

- 总分与等级。
- 维度分：结构、语义、信息密度、权威性、技术 SEO、可读性、AI 引用准备度。
- 页面摘要：title、description、canonical、lang、word count、heading count、schema count。
- 内容结构：heading 树、主要内容块、FAQ/列表识别。
- 实体与主题：品牌、产品、人物、地点、概念、主题聚类。
- 产品匹配度：页面是否清楚表达目标产品、关键词、受众、价值主张。
- 优化建议：优先级、影响、工作量、问题定位、建议动作。
- 抓取诊断：最终 URL、状态码、耗时、抓取方式、失败原因。

4. 状态与恢复

- 任务有明确状态：`queued`、`fetching`、`analyzing`、`scoring`、`completed`、`partial`、`failed`。
- 前端继续映射为现有 `collecting`、`analyzing`、`completed`、`partial`、`failed`。
- 结果查询必须以数据库状态为准，SSE 只做实时投影。

5. 权限与订阅

- 所有平台侧入口走 `resolveGuard(req, { module: 'visibility' })`。
- 上游服务通过项目级 JWT 校验 `workspaceId`、`projectId`、role。
- 用户只能查询当前工作区项目的分析任务。

### 4.2 第二版再做

- PDF 导出。
- 历史趋势对比。
- 定时重跑。
- 真实 AI 引用检测。
- 公开免费分析入口。
- 付费单次报告解锁。

## 5. API 设计

### 5.1 平台侧 API

新增平台代理接口：

#### `POST /api/integration/product-website/analyze`

用途：创建一次产品网站分析任务。

请求：

```json
{
  "projectId": "project_id",
  "url": "https://example.com/product"
}
```

`url` 可选，缺省时使用项目中的 `productUrl` 或 `url`。

平台侧处理：

1. 调用 `resolveGuard` 校验权限和订阅。
2. 查询当前项目产品字段。
3. 查询项目关联品牌。
4. 标准化并校验目标 URL。
5. 调用上游 `POST /api/product-website/analyze`。

传给上游：

```json
{
  "project_id": "project_id",
  "workspace_id": "workspace_id",
  "target_url": "https://example.com/product",
  "project": {
    "name": "项目名",
    "url": "https://example.com",
    "industry": "行业",
    "product_name": "产品名",
    "product_keywords": ["关键词"],
    "product_description": "产品描述",
    "product_url": "https://example.com/product"
  },
  "brands": [
    {
      "id": "brand_id",
      "name": "品牌名",
      "aliases": [],
      "is_competitor": false
    }
  ]
}
```

响应：

```json
{
  "analysisId": "pwa_xxx",
  "status": "queued"
}
```

#### `GET /api/integration/product-website/:id`

用途：查询分析状态和结果。

响应：

```json
{
  "id": "pwa_xxx",
  "projectId": "project_id",
  "targetUrl": "https://example.com/product",
  "status": "completed",
  "stage": "scoring",
  "score": {
    "overall": 82,
    "grade": "A",
    "dimensions": {
      "structure": 85,
      "semantic": 78,
      "density": 80,
      "authority": 72,
      "technical": 90,
      "readability": 86,
      "productClarity": 76
    }
  },
  "summary": {},
  "recommendations": [],
  "diagnostics": {}
}
```

#### `GET /api/integration/product-website/:id/events`

用途：SSE 进度投影。

要求：

- 连接建立时先发送 snapshot。
- 后续发送 stage/status 变化。
- 前端断线后可回到 `GET /api/integration/product-website/:id`。

#### `POST /api/integration/product-website/:id/retry`

用途：重试失败任务。

第一版可只支持整单重试；如果上游已具备阶段状态机，可支持从失败阶段重试。

### 5.2 上游 visibility 服务 API

建议新增：

- `POST /api/product-website/analyze`
- `GET /api/product-website/{analysis_id}`
- `GET /api/product-website/{analysis_id}/events`
- `POST /api/product-website/{analysis_id}/retry`

这些接口不替代现有 `/api/audits`，而是作为“网站自身可理解度评估”的独立任务类型。原因是现有 audit 更偏“AI 平台问答中品牌/竞品表现”，而本功能更偏“网站页面本身是否具备被 AI 理解和引用的基础条件”。

## 6. 数据模型设计

### 6.1 平台侧 Prisma

第一版平台侧可以不落完整分析结果，只作为代理读取上游结果。为了让列表页、最近一次分析、趋势入口更快，建议增加轻量镜像表。

新增 `ProductWebsiteAnalysisMirror`：

```prisma
model ProductWebsiteAnalysisMirror {
  id             String   @id @db.Text
  projectId      String   @db.Text
  workspaceId    String   @db.Text
  targetUrl      String   @db.Text
  status         String   @db.Text
  overallScore   Int?
  grade          String?  @db.Text
  summary        Json?
  upstreamId     String   @unique @db.Text
  startedAt      DateTime?
  completedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([projectId, createdAt])
  @@index([workspaceId, createdAt])
}
```

如果第一版需要更快落地，也可以暂不加表，由上游作为唯一数据源。推荐加镜像表，因为平台首页/项目页需要快速展示最近一次状态，不必每次打上游。

### 6.2 上游服务数据模型

上游新增核心表：

`product_website_analyses`

- `id`
- `workspace_id`
- `project_id`
- `target_url`
- `normalized_domain`
- `status`
- `stage`
- `error_code`
- `error_message`
- `attempt_count`
- `last_heartbeat_at`
- `locked_by_worker`
- `locked_until`
- `input_snapshot`
- `result_snapshot`
- `score_overall`
- `score_grade`
- `created_at`
- `started_at`
- `completed_at`
- `updated_at`

`product_website_stage_runs`

- `id`
- `analysis_id`
- `stage_name`
- `status`
- `attempt_no`
- `input_snapshot`
- `output_snapshot`
- `error_code`
- `error_message`
- `duration_ms`
- `started_at`
- `finished_at`

`product_website_crawl_logs`

- `id`
- `analysis_id`
- `target_url`
- `final_url`
- `method`
- `status_code`
- `content_length`
- `duration_ms`
- `error`
- `created_at`

`product_website_events`

- `id`
- `analysis_id`
- `event_type`
- `stage`
- `payload`
- `created_at`

## 7. 分析流程

### 7.1 阶段状态机

```text
queued
  -> fetching
  -> extracting
  -> semantic_analyzing
  -> scoring
  -> recommendation_generating
  -> finalizing
  -> completed

失败分支：
  fetching_failed -> failed 或 retrying
  semantic_failed -> partial 或 failed
  recommendation_failed -> partial
```

前端状态映射：

- `queued`、`fetching` -> `collecting`
- `extracting`、`semantic_analyzing`、`scoring`、`recommendation_generating`、`finalizing` -> `analyzing`
- `completed` -> `completed`
- `partial` -> `partial`
- `failed` -> `failed`

### 7.2 抓取阶段

输入：`target_url`。

要求：

- 只允许 `http` 和 `https`。
- 禁止 localhost、内网 IP、链路本地地址、metadata endpoint。
- 跟随有限次数重定向。
- 记录最终 URL、状态码、耗时、HTML 大小。
- 超时上限建议 15 到 30 秒。

抓取策略可参考 `geo-cn`：

1. 标准浏览器 UA 请求。
2. 增强 headers 请求。
3. 必要时使用 Playwright 抓取渲染后 HTML。

不建议第一版使用字符串拼接 `curl` 兜底。

### 7.3 抽取阶段

从 HTML 中抽取：

- metadata：title、description、keywords、author、canonical、lang、viewport、charset、OG。
- structure：H1-H6、heading tree、section tree。
- content：main/article/body 主体内容块、段落、列表、FAQ、blockquote、code。
- schema：JSON-LD、Microdata。
- links：内链、外链、canonical、重要 CTA 链接。
- media：主要图片 alt、缺失 alt 数量。

### 7.4 产品语义分析

结合项目产品上下文判断：

- 页面是否明确出现产品名。
- 页面是否覆盖 `productKeywords`。
- title/description/H1 是否表达产品类别和核心价值。
- 是否能识别出自有品牌和竞品。
- 是否存在“品牌名强、产品弱”或“产品名强、价值主张弱”的问题。
- 是否有明确受众、场景、功能、价格、案例、FAQ、对比信息。

建议输出 `productClarity` 维度，避免只做通用 SEO。

### 7.5 评分模型

建议第一版评分维度：

- `structure` 15%：标题层级、章节完整性、FAQ/列表结构。
- `semantic` 20%：实体、主题、产品关键词、品牌关系清晰度。
- `density` 15%：内容深度、信息量、数据/案例/细节。
- `authority` 15%：作者、发布时间、案例、证明、外部引用、信任信号。
- `technical` 15%：metadata、canonical、Schema、lang、viewport、图片 alt。
- `readability` 10%：段落长度、句子复杂度、可扫描性。
- `productClarity` 10%：产品名、定位、价值主张、目标用户、CTA 清晰度。

等级：

- A+：90 到 100
- A：80 到 89
- B：70 到 79
- C：60 到 69
- D：50 到 59
- F：小于 50

### 7.6 建议生成

建议项字段：

```json
{
  "id": "rec_xxx",
  "dimension": "productClarity",
  "priority": "high",
  "impact": "high",
  "effort": "medium",
  "title": "强化 H1 与首屏中的产品定位",
  "problem": "页面首屏没有清楚说明产品解决什么问题",
  "evidence": ["H1 未包含产品名", "description 未出现核心关键词"],
  "actions": [
    "将 H1 改为包含产品名和核心用途的句子",
    "在首屏补充目标用户和关键场景",
    "为页面增加 Product 或 SoftwareApplication Schema"
  ],
  "expectedLift": 8
}
```

第一版建议生成优先使用规则 + 模板，LLM 用于摘要和行动项润色。这样成本可控，也更容易测试。

## 8. 前端设计建议

入口位置：

- 项目详情页增加“产品网站分析”区块。
- `visibility` 页面增加一个 tab：`网站可见性`，区别于现有 AI 平台审计。

页面信息架构：

1. 顶部状态条

- 目标 URL。
- 最近分析时间。
- 状态。
- 重新分析按钮。

2. 分数概览

- 总分 gauge。
- 等级。
- 7 个维度小卡片。

3. 页面摘要

- title、description、canonical、语言、字数、heading 数、Schema 数。
- 抓取诊断。

4. 产品表达分析

- 产品名命中。
- 关键词覆盖。
- 价值主张清晰度。
- 受众/场景/CTA 检测。

5. 优化建议

- 按高优先级排序。
- 支持按维度筛选。
- 每条建议显示证据、动作、预期提升。

6. 结构详情

- heading tree。
- Schema 列表。
- 主要实体和主题。

第一版 UI 可以复用现有 `score-gauge`、`diagnostic-checklist`、`data-table`、`empty-state` 等组件。

## 9. 实施阶段

### Phase 0：接口与模型冻结

交付：

- 确认平台代理 API。
- 确认上游 API contract。
- 确认评分维度和响应 JSON。
- 决定平台侧是否新增 mirror 表。

验收：

- 前后端可以基于 mock JSON 并行开发。

### Phase 1：上游分析任务

交付：

- 上游新增 product website analysis API。
- 新增状态表、阶段表、事件表和抓取日志表。
- 实现 URL 校验、抓取、HTML 抽取。

验收：

- 输入 URL 后能生成分析任务。
- 失败时能看到明确抓取错误。
- `GET` 能返回当前状态。

### Phase 2：评分与建议

交付：

- 实现 7 维评分。
- 实现产品语义匹配。
- 实现规则型建议生成。
- 结果 snapshot 落库。

验收：

- 对一个真实产品站输出稳定分数和建议。
- 同一 HTML 的评分结果可重复。

### Phase 3：平台代理与镜像

交付：

- 新增 `src/app/api/integration/product-website/**`。
- 读取项目产品字段和品牌关联后调用上游。
- 可选：新增 Prisma mirror 表和 migration。

验收：

- 未登录、未订阅、跨工作区项目都被拦截。
- 正常项目能发起任务并查询结果。

### Phase 4：前端页面

交付：

- 产品网站分析入口。
- 状态展示。
- 分数和建议展示。
- 错误与空状态。

验收：

- 分析中、完成、部分完成、失败四类状态都有明确展示。
- 页面刷新后状态不丢。

### Phase 5：测试和回归

单元测试：

- URL 标准化与 SSRF 拦截。
- 评分计算。
- 产品关键词覆盖。
- 建议优先级排序。
- 平台 API guard。

集成测试：

- 创建分析任务。
- 上游超时映射。
- 分析失败后查询错误。
- mirror 表同步。

E2E：

- 项目页发起分析。
- 进度变化。
- 完成后查看建议。
- 刷新页面恢复结果。

## 10. 风险与对策

### 风险 1：抓取外部网站带来 SSRF 风险

对策：

- 严格 URL 协议校验。
- 禁止内网 IP、localhost、metadata endpoint。
- DNS 解析后再次校验 IP。
- 限制重定向次数，重定向后重新校验目标。

### 风险 2：LLM 成本和稳定性不可控

对策：

- 第一版评分和建议以规则为主。
- LLM 只用于实体/摘要等增强能力。
- LLM 失败降级为 partial，不让整单失败。

### 风险 3：平台侧和上游状态不一致

对策：

- 上游数据库为状态真相。
- 平台 mirror 只缓存最近摘要。
- 查询详情时优先读上游。

### 风险 4：与现有 AI 平台审计概念混淆

对策：

- 命名区分：`网站可见性` vs `AI 平台可见性`。
- 产品网站分析关注页面基础能力。
- 现有 audits 关注平台问答里的品牌表现。

### 风险 5：产品 URL 缺失或质量差

对策：

- 默认用 `productUrl`，没有则用 `url`。
- 两者都没有时引导用户先补充项目网站。
- 如果抓取到首页但产品上下文缺失，提示完善产品信息。

## 11. 建议的优先级决策

推荐先做“内部项目产品网站分析”，不要先做公开免费检测或付费报告。原因：

- 当前平台已有订阅和项目上下文，能直接服务已登录用户。
- 产品上下文是差异化能力，优于通用网站 SEO 检测。
- 外部 visibility 服务已经存在审计工作流，先扩展任务类型成本最低。

第一版最小可上线范围：

1. 项目内发起分析。
2. 抓取并解析产品页面。
3. 输出 7 维评分。
4. 输出高优先级建议。
5. 页面可查看最近一次结果。

完成这 5 点后，再考虑历史趋势、PDF、定时重跑和真实 AI 引用检测。

## 12. 完整功能模块设计

完整产品网站可见性分析可以拆成 9 个模块：

1. 网站基础分析
2. 产品语义与品牌匹配
3. 优化建议与任务化
4. 历史趋势
5. PDF 与报告中心
6. 真实 AI 引用检测
7. 定时监控与告警
8. 成本、额度与权限
9. 数据留存、可观测性与安全

这些模块不需要一次性全部上线。建议先把模块边界和数据 contract 定好，后续按阶段逐步打开。

## 13. 模块一：网站基础分析

### 13.1 职责

网站基础分析负责回答一个问题：这个产品网站页面本身是否具备被搜索引擎和 AI 系统理解、引用、推荐的基础条件。

输入：

- `target_url`
- 项目产品上下文
- 品牌与竞品上下文

输出：

- 抓取诊断
- 页面元数据
- 内容结构
- Schema 信息
- 技术 SEO 信号
- 内容质量和可读性
- 基础评分

### 13.1.1 抓取技术选型

网站数据抓取建议不要只做一个本地 `fetch` 实现，而是设计为可插拔的抓取供应商层。

推荐抽象：

```ts
interface WebsiteFetchProvider {
  name: "native_fetch" | "playwright" | "firecrawl" | "custom";
  fetch(input: WebsiteFetchInput): Promise<WebsiteFetchResult>;
}

interface WebsiteFetchInput {
  url: string;
  mode: "single_page" | "site_map" | "limited_crawl";
  maxPages?: number;
  timeoutMs: number;
  formats: ("html" | "markdown" | "metadata" | "screenshot")[];
  respectRobots?: boolean;
}

interface WebsiteFetchResult {
  provider: string;
  requestedUrl: string;
  finalUrl: string;
  statusCode?: number;
  html?: string;
  markdown?: string;
  metadata?: Record<string, unknown>;
  links?: string[];
  screenshotUrl?: string;
  durationMs: number;
  error?: string;
}
```

第一版建议支持三种 provider：

1. `native_fetch`

- 用于普通静态 HTML 页面。
- 成本最低、可控性最高。
- 缺点是对 JS-heavy 页面、反爬和正文抽取的稳定性一般。

2. `playwright`

- 用于需要浏览器渲染的页面。
- 可以获取最终 DOM、截图和交互后内容。
- 缺点是资源消耗高、队列和超时控制更复杂。

3. `firecrawl`

- 作为第三方托管抓取和内容抽取能力。
- 适合需要更稳定正文抽取、Markdown 输出、整站 crawl、URL map、多页面分析的场景。
- 缺点是有外部成本、供应商依赖、数据出境/合规和 API 限流问题。

### 13.1.2 是否引入 Firecrawl

建议：需要考虑 Firecrawl，但不要把 Firecrawl 作为唯一抓取路径。最佳方式是“本地基础抓取 + Firecrawl 增强/兜底 + Playwright 特殊兜底”。

Firecrawl 的价值：

- 单页 scrape 可以直接返回适合 AI 消费的 Markdown/JSON，减少本地正文清洗工作。
- crawl 可以抓取整站或多页面，适合后续从单页分析扩展到产品站点级分析。
- map 可以快速获得站点 URL 列表，适合发现产品页、定价页、案例页、FAQ 页。
- 对 JS-heavy 页面、正文抽取、PDF/文档解析等场景通常比简单 fetch 更稳定。

不建议完全依赖 Firecrawl 的原因：

- 成本和额度不可忽略，尤其是定时监控和批量项目。
- 外部服务不可用会影响核心分析链路。
- 部分客户网站可能有数据合规要求，不希望把页面内容发送给第三方。
- Firecrawl 输出的 Markdown 更适合语义分析，但技术 SEO 仍需要原始 HTML 和 DOM 信号。

推荐策略：

```text
默认单页分析：
  native_fetch(html)
    -> 成功且内容足够：进入 HTML 抽取
    -> HTML 无效/内容过少/疑似 JS 渲染：尝试 firecrawl scrape(markdown + metadata + html)
    -> 仍失败：尝试 playwright render

站点级分析：
  firecrawl map
    -> 选择产品页/定价页/案例页/FAQ 页
    -> firecrawl batch scrape 或 limited crawl
    -> 合并多页面结果评分

高合规客户：
  禁用 firecrawl
    -> native_fetch + 自托管 playwright
```

### 13.1.3 抓取模式

建议把分析分成三种模式：

1. `single_page`

- 只分析 `productUrl` 或用户输入 URL。
- MVP 默认模式。
- 成本低，响应快。

2. `site_map`

- 先获取 URL map，再选择关键页面。
- 适合判断产品站点结构是否完整。
- 可用于后续建议“缺少 FAQ 页/案例页/对比页”。

3. `limited_crawl`

- 限制抓取 5 到 20 个页面。
- 适合生成完整产品网站报告。
- 应该进入 Pro/Team 能力，不建议免费或 MVP 默认开启。

### 13.1.4 配置建议

环境变量：

```text
WEBSITE_FETCH_PROVIDER=auto|native_fetch|firecrawl|playwright
FIRECRAWL_API_KEY=...
FIRECRAWL_API_URL=https://api.firecrawl.dev
FIRECRAWL_ENABLED=true|false
FIRECRAWL_MAX_PAGES=10
FIRECRAWL_TIMEOUT_MS=30000
```

Workspace 或企业级配置：

- 是否允许第三方抓取服务。
- 是否允许保存原始 HTML。
- 是否启用站点级 crawl。
- 最大抓取页面数。

### 13.1.5 数据准确性判断

为了比较 native、Firecrawl、Playwright 的效果，需要保存抓取质量指标：

- `contentLength`
- `wordCount`
- `mainContentRatio`
- `titleDetected`
- `descriptionDetected`
- `headingCount`
- `schemaCount`
- `markdownAvailable`
- `htmlAvailable`
- `providerConfidence`

当多个 provider 都成功时，建议：

- 技术 SEO 使用原始 HTML/DOM。
- 语义分析优先使用清洗后的 Markdown。
- 结构分析使用 DOM heading tree。
- 报告里记录 provider，便于排查分数差异。

### 13.2 关键数据结构

```ts
interface ProductWebsiteAnalysisResult {
  id: string;
  projectId: string;
  workspaceId: string;
  targetUrl: string;
  finalUrl: string;
  status: ProductWebsiteAnalysisStatus;
  analyzedAt: string;
  crawl: CrawlDiagnostics;
  page: PageSnapshot;
  score: ProductWebsiteScore;
  product: ProductClarityResult;
  recommendations: ProductWebsiteRecommendation[];
  citations?: AiCitationReport;
  trends?: ProductWebsiteTrendSummary;
}

type ProductWebsiteAnalysisStatus =
  | "queued"
  | "fetching"
  | "extracting"
  | "semantic_analyzing"
  | "scoring"
  | "recommendation_generating"
  | "citation_checking"
  | "report_generating"
  | "completed"
  | "partial"
  | "failed";
```

### 13.3 页面快照

```ts
interface PageSnapshot {
  title: string | null;
  description: string | null;
  canonical: string | null;
  lang: string | null;
  charset: string | null;
  viewport: string | null;
  openGraph: Record<string, string>;
  headings: { level: number; text: string; id?: string }[];
  wordCount: number;
  paragraphCount: number;
  listCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  schema: {
    jsonLdTypes: string[];
    microdataTypes: string[];
    rawCount: number;
  };
  links: {
    internal: number;
    external: number;
    ctaCandidates: { text: string; href: string }[];
  };
}
```

### 13.4 验收标准

- 能稳定抓取普通静态站和常见 SSR/CSR 站点。
- 抓取失败时返回可解释错误，不产生空白报告。
- 同一 HTML 重复分析时基础分数一致。
- 所有外部 URL 抓取都经过 SSRF 防护。

## 14. 模块二：产品语义与品牌匹配

### 14.1 职责

产品语义分析负责回答：页面是否清楚地表达了当前项目的产品、行业、价值主张、目标用户和品牌关系。

它和通用 SEO 的区别在于，评分不是只看 title、description、H1 是否存在，而是看它们是否服务于当前项目产品。

### 14.2 分析项

- 产品名是否出现在 title、description、H1、首屏主体内容。
- 产品关键词覆盖率。
- 产品描述中的核心能力是否在页面正文出现。
- 行业词和产品类别是否清晰。
- 自有品牌是否清楚，是否和竞品混淆。
- 是否有目标用户、使用场景、功能、优势、价格、案例、FAQ、CTA。
- 是否存在 AI 难以理解的空泛表达，例如只写“领先解决方案”但不说解决什么问题。

### 14.3 输出结构

```ts
interface ProductClarityResult {
  score: number;
  productNameCoverage: {
    inTitle: boolean;
    inDescription: boolean;
    inH1: boolean;
    inBody: boolean;
  };
  keywordCoverage: {
    total: number;
    matched: number;
    missing: string[];
    matchedKeywords: string[];
  };
  valueProposition: {
    detected: boolean;
    summary: string | null;
    issues: string[];
  };
  audienceAndUseCases: {
    audienceDetected: boolean;
    useCasesDetected: boolean;
    evidence: string[];
  };
  brandFit: {
    ownBrandMentions: string[];
    competitorMentions: string[];
    confusionRisk: "low" | "medium" | "high";
  };
}
```

### 14.4 验收标准

- 产品字段为空时能降级为通用网站分析，并提示补充产品信息。
- 产品字段完整时，报告必须包含产品表达分析。
- 不得编造产品能力、客户案例、价格和数据。

## 15. 模块三：优化建议与任务化

### 15.1 职责

优化建议模块负责把评分问题转成可执行动作。建议不只是“提高 SEO”，而要能变成内容、技术或产品页面改造任务。

### 15.2 建议分类

- `technical_seo`：metadata、canonical、lang、Schema、alt、robots、sitemap。
- `content_structure`：H1、标题层级、目录、段落、FAQ、列表。
- `product_clarity`：产品名、价值主张、目标用户、场景、CTA。
- `authority`：作者、发布时间、案例、证明、引用、资质。
- `ai_citation_readiness`：可引用段落、问答结构、事实型信息、来源可信度。
- `competitive_positioning`：与竞品差异表达、对比内容、替代方案页面。

### 15.3 建议字段

```ts
interface ProductWebsiteRecommendation {
  id: string;
  dimension: string;
  priority: "critical" | "high" | "medium" | "low";
  impact: "high" | "medium" | "low";
  effort: "small" | "medium" | "large";
  title: string;
  problem: string;
  evidence: string[];
  actions: string[];
  example?: {
    type: "copy" | "schema" | "html" | "content_outline";
    before?: string;
    after?: string;
    code?: string;
  };
  expectedLift: number;
  relatedFields?: string[];
  taskStatus?: "open" | "accepted" | "dismissed" | "done";
}
```

### 15.4 与内容模块联动

建议后续把高优先级建议转成内容 brief：

- 产品表达弱：生成产品页首屏改写 brief。
- FAQ 缺失：生成 FAQ 内容 brief。
- 权威信号弱：生成案例页、对比页、行业解释页 brief。
- AI 引用准备度低：生成“事实型段落”和“引用友好摘要” brief。

平台侧可以复用现有内容模块中的 `brief-from-suggestion` 思路，但需要新增 suggestion source：`product_website_analysis`。

## 16. 模块四：历史趋势

### 16.1 职责

历史趋势负责回答：

- 产品网站可见性是否在变好。
- 哪些维度持续拖后腿。
- 哪次改版、内容发布或技术调整影响了分数。
- AI 引用和网站基础分是否相关。

### 16.2 数据模型

上游服务建议保留完整 snapshot，不只存分数。

`product_website_analysis_snapshots`

- `id`
- `analysis_id`
- `workspace_id`
- `project_id`
- `target_url`
- `final_url`
- `score_overall`
- `score_grade`
- `score_dimensions`
- `product_clarity_score`
- `citation_count`
- `citation_sources`
- `recommendation_counts`
- `page_hash`
- `content_hash`
- `analyzed_at`
- `created_at`

`page_hash` 用来判断页面内容是否发生变化。`content_hash` 只基于清洗后的正文，避免广告、时间戳、随机脚本导致误判。

平台侧 mirror 表可以只缓存最近一条和趋势摘要：

```prisma
model ProductWebsiteAnalysisMirror {
  id             String   @id @db.Text
  projectId      String   @db.Text
  workspaceId    String   @db.Text
  targetUrl      String   @db.Text
  status         String   @db.Text
  overallScore   Int?
  grade          String?  @db.Text
  trendDelta7d   Int?
  trendDelta30d  Int?
  summary        Json?
  upstreamId     String   @unique @db.Text
  startedAt      DateTime?
  completedAt    DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([projectId, createdAt])
  @@index([workspaceId, createdAt])
}
```

### 16.3 趋势 API

平台侧：

- `GET /api/integration/product-website/trends?projectId=...&range=30d`

上游：

- `GET /api/product-website/projects/{project_id}/trends?range=30d`

响应：

```json
{
  "projectId": "project_id",
  "range": "30d",
  "points": [
    {
      "analysisId": "pwa_xxx",
      "date": "2026-06-30T08:00:00Z",
      "overall": 82,
      "dimensions": {
        "structure": 85,
        "semantic": 78,
        "density": 80,
        "authority": 72,
        "technical": 90,
        "readability": 86,
        "productClarity": 76,
        "aiCitationReadiness": 64
      },
      "citationCount": 3,
      "pageChanged": true
    }
  ],
  "summary": {
    "currentScore": 82,
    "delta": 6,
    "bestDimension": "technical",
    "weakestDimension": "aiCitationReadiness",
    "regressions": ["authority"],
    "improvements": ["structure", "productClarity"]
  }
}
```

### 16.4 前端展示

建议增加：

- 总分趋势折线图。
- 维度趋势雷达或小多图。
- 页面变化标记。
- 建议完成数与分数变化关联。
- AI 引用数量趋势。

### 16.5 验收标准

- 至少支持 7 天、30 天、90 天范围。
- 同一天多次分析时保留明细，趋势默认取当天最后一次。
- 页面内容未变化时仍可记录分数，但要标记 `pageChanged=false`。
- 趋势计算不依赖前端，后端 API 直接返回可展示数据。

## 17. 模块五：PDF 与报告中心

### 17.1 职责

PDF 和报告中心负责把分析结果转成可分享、可归档、可给客户或团队看的正式报告。

第一版可以先做 HTML 报告页，PDF 作为后续导出能力。不要先把 PDF 做成唯一报告载体。

### 17.2 报告类型

1. 快速报告

- 单次分析摘要。
- 总分、维度分、页面摘要、Top 5 建议。
- 适合页面内展示。

2. 完整报告

- 执行摘要。
- 网站基础分析。
- 产品表达分析。
- AI 引用检测。
- 历史趋势。
- 竞品引用对比。
- 详细优化建议。
- 30 天行动计划。

3. 对比报告

- 两次分析对比。
- 改版前后分数变化。
- 新增和消失的引用。
- 建议完成后的影响。

### 17.3 报告数据结构

```ts
interface ProductWebsiteReport {
  id: string;
  analysisId: string;
  projectId: string;
  reportType: "quick" | "full" | "comparison";
  title: string;
  generatedAt: string;
  executiveSummary: string;
  keyFindings: {
    type: "positive" | "warning" | "critical";
    title: string;
    detail: string;
  }[];
  score: ProductWebsiteScore;
  pageSummary: PageSnapshot;
  productSummary: ProductClarityResult;
  citationSummary?: AiCitationReport;
  trendSummary?: ProductWebsiteTrendSummary;
  recommendations: ProductWebsiteRecommendation[];
  actionPlan: {
    horizon: "7d" | "30d" | "90d";
    items: {
      title: string;
      ownerRole: "content" | "engineering" | "marketing" | "product";
      priority: string;
      expectedLift: number;
    }[];
  };
}
```

### 17.4 PDF 实现选型

推荐两阶段：

Phase A：HTML 报告页

- 复用前端组件。
- 页面可分享给同 workspace 用户。
- 导出时不需要处理字体和分页。

Phase B：PDF 导出

可选实现：

1. Playwright 打印 HTML 到 PDF

- 优点：样式和页面一致，中文字体处理更自然。
- 缺点：需要浏览器运行环境。

2. jsPDF 或 pdfkit 生成

- 优点：服务端纯生成，结构可控。
- 缺点：中文字体、分页、图表较麻烦。

推荐用 Playwright HTML-to-PDF，和真实 AI 引用检测可能共用 Playwright 依赖，但要隔离队列和超时，避免 PDF 生成阻塞引用检测。

### 17.5 API

平台侧：

- `POST /api/integration/product-website/:id/report`
- `GET /api/integration/product-website/reports/:reportId`
- `GET /api/integration/product-website/reports/:reportId/pdf`

上游：

- `POST /api/product-website/{analysis_id}/report`
- `GET /api/product-website/reports/{report_id}`
- `GET /api/product-website/reports/{report_id}/pdf`

### 17.6 PDF 验收标准

- 中文不乱码。
- 图表、表格、建议列表分页正常。
- 文件名包含项目名、域名、日期。
- PDF 生成失败不影响 HTML 报告查看。
- 大报告生成超时后可重试。

## 18. 模块六：真实 AI 引用检测

### 18.1 职责

真实 AI 引用检测负责回答：

- AI 搜索或问答平台是否引用了目标产品网站。
- 引用来自哪些平台、哪些查询、哪些页面。
- 引用质量如何，是否引用到了正确产品页面。
- 与竞品相比，当前产品被 AI 引用的机会差在哪里。

### 18.2 检测平台

检测平台应与当前智见 visibility 服务使用的平台保持一致，不在产品网站分析里另起一套平台口径。

平台来源：

- 平台侧继续通过 `GET /api/integration/platforms` 代理上游 `/api/platforms`。
- 产品网站引用检测使用同一份平台 key、label、启用状态和排序。
- 阶段 5 的真实 AI 引用检测优先使用国内大模型平台，沿用智见现有平台口径：`deepseek`、`doubao`、`hunyuan`、`qwen`、`kimi`。
- 如果上游当前平台 key 对混元使用 `yuanbao` 或其他命名，应在 `/api/platforms` 中返回稳定 key，并在平台侧只做 label 映射，不在产品网站分析里重新定义一套 key。
- 最终平台集合以上游 `/api/platforms` 为准，但阶段 5 不默认纳入海外平台。

这样做的好处：

- AI 平台可见性审计和产品网站引用检测的图表口径一致。
- 趋势、对比、报告不需要维护两套平台映射。
- 上游新增或下线平台时，平台侧自动同步。
- 用户不会看到“审计里是 A 平台，网站引用里是 B 平台”的混乱体验。

平台能力需要按检测方式分级：

1. `audit_supported`

- 当前智见服务已经能用于品牌问答审计的平台。
- 产品网站分析默认继承这些平台。

2. `citation_supported`

- 能做真实引用检测的平台。
- 不是所有 audit 平台都一定支持真实引用检测。

3. `citation_mock_only`

- 暂时只能用模拟或启发式结果的平台。
- 报告中必须标注为“未开启真实检测”。

4. `disabled`

- 平台临时不可用或当前 workspace 未开启。

建议上游 `/api/platforms` 返回扩展字段：

```json
{
  "key": "deepseek",
  "label": "DeepSeek",
  "enabled": true,
  "capabilities": {
    "audit": true,
    "citationDetection": false,
    "realTimeQuery": true
  },
  "region": "CN",
  "priority": 10
}
```

如果短期无法改 `/api/platforms`，产品网站分析可以先读取现有平台列表，并在上游内部维护 `citationDetection` 能力映射。

### 18.2.1 平台分级

第一批：

- DeepSeek：`deepseek`
- 豆包：`doubao`
- 腾讯混元：`hunyuan`
- 通义千问：`qwen`
- Kimi：`kimi`

第二批：

- 智见服务后续新增且已具备自动查询能力的国内平台。
- 如文心一言、腾讯元宝等平台已在上游稳定支持，可按 `/api/platforms` 的 capability 配置逐步加入。

暂不纳入阶段 5 默认范围：

- ChatGPT browsing/search。
- Perplexity。
- Google AI / Gemini 搜索体验。
- Bing Copilot 或 Bing 搜索 AI 摘要。
- Claude web search。

真实检测容易受登录态、反自动化、页面变化影响，不建议作为第一版主链路必需步骤。第一版可以先输出 `aiCitationReadiness`，第二版再接真实检测。

### 18.3 查询生成

查询不能只用 `site:domain`。建议生成 4 类查询：

1. 品牌直查

- `{brandName}`
- `{brandName} {productName}`

2. 产品类别

- `{productName} 是什么`
- `{industry} {productKeywords[0]} 工具推荐`

3. 场景问题

- `如何解决 {productDescription 提炼的问题}`
- `{targetAudience} 用什么工具做 {useCase}`

4. 竞品对比

- `{brandName} 和 {competitorName} 对比`
- `{competitorName} 替代方案`

查询生成需要保存 snapshot，保证同一次检测可复盘。

### 18.4 引用匹配规则

引用命中分 4 级：

- `direct_link`：AI 回答或引用卡片直接链接到目标域名。
- `domain_mention`：正文提到目标域名，但没有可点击链接。
- `brand_mention`：提到品牌或产品，但没有链接。
- `no_mention`：没有提及。

还需要判断引用是否正确：

- 链接是否指向目标产品页或同域相关页。
- 是否引用了过期页面。
- 是否把自有品牌和竞品混淆。
- 摘要内容是否准确。

### 18.5 数据结构

```ts
interface AiCitationReport {
  totalCitations: number;
  directLinks: number;
  brandMentions: number;
  domainMentions: number;
  byPlatform: Record<string, AiCitationPlatformSummary>;
  byQuery: AiCitationQueryResult[];
  topCitedPages: {
    url: string;
    count: number;
    platforms: string[];
  }[];
  competitorComparison?: {
    brand: string;
    citationCount: number;
    directLinks: number;
  }[];
}

interface AiCitationQueryResult {
  query: string;
  platform: string;
  status: "completed" | "failed" | "skipped";
  matchType: "direct_link" | "domain_mention" | "brand_mention" | "no_mention";
  citedUrls: string[];
  answerExcerpt?: string;
  confidence: number;
  checkedAt: string;
  error?: string;
}
```

### 18.6 上游数据模型

`ai_citation_checks`

- `id`
- `analysis_id`
- `workspace_id`
- `project_id`
- `status`
- `mode`：`mock`、`real`、`hybrid`
- `query_snapshot`
- `result_snapshot`
- `started_at`
- `completed_at`
- `created_at`

`ai_citation_query_runs`

- `id`
- `check_id`
- `platform`
- `query`
- `status`
- `match_type`
- `cited_urls`
- `answer_excerpt`
- `confidence`
- `error_code`
- `error_message`
- `duration_ms`
- `created_at`

### 18.7 执行策略

- 每个平台独立超时，建议 30 到 60 秒。
- 使用 `Promise.allSettled` 或后端等价机制，不让单个平台失败拖垮整单。
- 平台级失败记为 partial。
- 对同一项目和同一查询做短期缓存，默认 24 小时。
- 真实模式需要环境变量开关：`AI_CITATION_MODE=mock|real|hybrid`。
- 生产环境建议先对少量用户或管理员开放。

### 18.8 风险与防护

- 平台反自动化：保留 mock/hybrid 模式，失败降级。
- 登录态问题：需要明确哪些平台不依赖登录，哪些需要人工配置。
- 结果不稳定：报告中展示检测时间和查询快照。
- 法务和条款风险：上线前确认平台使用方式，不绕过付费或访问限制。

### 18.9 验收标准

- 单个平台失败不会导致整个分析失败。
- 每条引用都能追溯到平台、查询、时间和匹配方式。
- 引用检测可以独立重试。
- mock、real、hybrid 三种模式可通过配置切换。

## 19. 模块七：定时监控与告警

### 19.1 职责

定时监控负责持续追踪产品网站可见性变化，而不是只做一次性报告。

监控对象：

- 页面基础分。
- 产品表达分。
- 技术 SEO 分。
- AI 引用数量。
- 竞品引用差距。
- 关键建议是否长期未处理。

### 19.2 监控配置

```ts
interface ProductWebsiteMonitorConfig {
  id: string;
  projectId: string;
  workspaceId: string;
  targetUrl: string;
  enabled: boolean;
  interval: "daily" | "weekly" | "monthly";
  includeCitationCheck: boolean;
  alertThresholds: {
    scoreDrop?: number;
    citationDrop?: number;
    crawlFailureCount?: number;
  };
  nextRunAt: string;
  lastRunAt: string | null;
}
```

### 19.3 API

平台侧：

- `GET /api/integration/product-website/monitor?projectId=...`
- `POST /api/integration/product-website/monitor`
- `PATCH /api/integration/product-website/monitor/:id`
- `DELETE /api/integration/product-website/monitor/:id`

上游：

- `GET /api/product-website/projects/{project_id}/monitor`
- `POST /api/product-website/monitor`
- `PATCH /api/product-website/monitor/{id}`
- `DELETE /api/product-website/monitor/{id}`
- `POST /api/cron/product-website-monitor`

### 19.4 告警规则

第一版告警可以只做站内通知：

- 抓取连续失败 2 次。
- 总分下降超过 10 分。
- 技术分下降超过 15 分。
- 真实 AI 直接引用数下降超过 30%。
- 页面内容变化但产品名或核心关键词消失。

后续再接邮件、企业微信、飞书或 Slack。

### 19.5 验收标准

- 定时任务可以从数据库恢复，不依赖进程内定时器。
- 任务有 lease，避免多 worker 重复执行。
- 告警有去重窗口，同一问题不连续刷屏。

## 20. 模块八：成本、额度与权限

### 20.1 额度模型

建议把产品网站分析纳入 `visibility` 模块订阅，但区分消耗类型：

- 基础网站分析：低成本。
- LLM 语义增强：中成本。
- 真实 AI 引用检测：高成本。
- PDF 生成：中成本。
- 定时监控：按频率消耗。

### 20.2 订阅分层建议

Free 或试用：

- 每月 1 到 3 次基础分析。
- 不含真实 AI 引用检测。
- 不含 PDF。

Pro：

- 每月固定次数基础分析。
- 少量真实 AI 引用检测。
- PDF 导出。
- 每周监控。

Team：

- 更多项目和分析次数。
- 竞品引用对比。
- 定时监控。
- 团队共享报告。

Enterprise：

- 自定义额度。
- 更高并发。
- 私有化或专用代理配置。
- 高级告警和审计日志。

### 20.3 权限控制

- `viewer`：查看报告。
- `member`：发起分析、导出 PDF。
- `admin`/`owner`：配置定时监控、删除报告、管理额度。

当前 `resolveGuard` 只校验 role 存在。后续如果需要细粒度控制，平台侧应在代理前检查 role。

### 20.4 成本保护

- 同一 URL 24 小时内重复分析可以提示复用上次结果。
- 真实引用检测默认不随每次基础分析自动执行。
- PDF 生成结果缓存，报告内容不变时直接返回旧 PDF。
- 上游超时和失败要计入诊断，但不重复消耗完整额度。

## 21. 模块九：数据留存、可观测性与安全

### 21.1 数据留存

建议：

- 完整 HTML 不长期保存，默认只保存清洗后的结构化快照。
- 抓取 HTML 如需调试，最多保存 7 天，并按 workspace 隔离。
- 分析 snapshot 长期保存，用于趋势和报告复现。
- AI 引用 answer excerpt 只保存短摘要，避免保存大段第三方内容。

### 21.2 日志和指标

需要记录：

- 抓取成功率。
- 抓取耗时 P50/P95。
- 分析耗时 P50/P95。
- LLM 调用次数、失败率、token 成本。
- 引用检测平台成功率。
- PDF 生成成功率。
- partial 和 failed 的原因分布。

### 21.3 安全要求

- SSRF 防护必须在上游服务执行，平台侧只能做第一层校验。
- 禁止请求内网、metadata endpoint、file 协议、非 HTTP 协议。
- 重定向后必须重新校验 URL。
- HTML 解析时不执行页面脚本，除非进入受控 Playwright 渲染模式。
- Playwright 渲染要禁用下载，限制权限，设置超时。
- 报告展示时所有 HTML 内容必须转义。

## 22. 完整 API Contract 汇总

### 22.1 平台侧 API

```text
POST   /api/integration/product-website/analyze
GET    /api/integration/product-website/:id
GET    /api/integration/product-website/:id/events
POST   /api/integration/product-website/:id/retry
GET    /api/integration/product-website/trends?projectId=...&range=30d
POST   /api/integration/product-website/:id/report
GET    /api/integration/product-website/reports/:reportId
GET    /api/integration/product-website/reports/:reportId/pdf
GET    /api/integration/product-website/monitor?projectId=...
POST   /api/integration/product-website/monitor
PATCH  /api/integration/product-website/monitor/:id
DELETE /api/integration/product-website/monitor/:id
```

### 22.2 上游服务 API

```text
POST   /api/product-website/analyze
GET    /api/product-website/{analysis_id}
GET    /api/product-website/{analysis_id}/events
POST   /api/product-website/{analysis_id}/retry
POST   /api/product-website/{analysis_id}/citation-check
GET    /api/product-website/{analysis_id}/citation-check
GET    /api/product-website/projects/{project_id}/trends
POST   /api/product-website/{analysis_id}/report
GET    /api/product-website/reports/{report_id}
GET    /api/product-website/reports/{report_id}/pdf
GET    /api/product-website/projects/{project_id}/monitor
POST   /api/product-website/monitor
PATCH  /api/product-website/monitor/{id}
DELETE /api/product-website/monitor/{id}
POST   /api/cron/product-website-monitor
```

### 22.3 错误响应

统一错误格式：

```json
{
  "error": {
    "code": "CRAWL_TIMEOUT",
    "message": "目标网站抓取超时",
    "stage": "fetching",
    "recoverable": true,
    "retryAfter": 300
  }
}
```

常见错误码：

- `INVALID_URL`
- `URL_NOT_ALLOWED`
- `CRAWL_TIMEOUT`
- `CRAWL_BLOCKED`
- `HTML_INVALID`
- `ANALYSIS_FAILED`
- `LLM_UNAVAILABLE`
- `CITATION_PLATFORM_FAILED`
- `REPORT_GENERATION_FAILED`
- `QUOTA_EXCEEDED`
- `UPSTREAM_TIMEOUT`

## 23. 分阶段落地路线

### 阶段 0：方案冻结和 mock

目标：

- 冻结 API contract。
- 冻结响应 JSON。
- 准备 mock 数据。

交付：

- 本方案文档。
- Mock JSON 文件或 mock route。
- 前端页面原型可基于 mock 开发。

验收：

- 平台侧和上游服务对字段命名、状态机、错误格式达成一致。

### 阶段 1：MVP 基础网站分析

目标：

- 用户能在项目内发起一次产品网站分析。
- 能看到基础分数和建议。

范围：

- 平台代理 API：create/get。
- 上游任务表、抓取、HTML 抽取、基础评分、建议生成。
- 前端基础结果页。

不做：

- PDF。
- 真实 AI 引用。
- 定时监控。
- 历史趋势。

验收：

- 真实产品 URL 可以成功分析。
- 抓取失败可解释。
- 页面刷新后结果不丢。

### 阶段 2：产品语义增强和建议任务化

目标：

- 让分析结果真正产品化，而不是通用 SEO。

范围：

- 产品语义匹配。
- 自有品牌和竞品识别。
- productClarity 评分。
- 建议分类、优先级、预期提升。
- 建议转内容 brief 的入口。

验收：

- 产品字段完整时，报告能明确指出产品表达问题。
- 高优先级建议可以直接转成内容或页面改造任务。

### 阶段 3：历史趋势

目标：

- 用户能看到产品网站可见性变化。

范围：

- snapshot 表。
- 趋势 API。
- 趋势图。
- 页面变化检测。

验收：

- 支持 7 天、30 天、90 天趋势。
- 能区分页面未变化但分数变化的情况。
- 最近一次结果和趋势摘要可快速加载。

### 阶段 4：HTML 报告和 PDF

目标：

- 生成可分享、可归档报告。

范围：

- 报告生成 API。
- HTML 报告页。
- PDF 导出。
- 报告缓存。

验收：

- 中文 PDF 正常。
- PDF 生成失败不影响 HTML 报告。
- 报告能复现当时 snapshot。

### 阶段 5：真实 AI 引用检测

目标：

- 识别 AI 平台是否真实引用产品网站。

范围：

- 查询生成。
- 国内大模型平台真实检测：DeepSeek、豆包、腾讯混元、通义千问、Kimi。
- 平台 key 沿用智见服务：`deepseek`、`doubao`、`hunyuan`、`qwen`、`kimi`。
- 引用匹配。
- 引用报告。
- mock/real/hybrid 配置。

验收：

- 单个平台失败只产生 partial。
- 每条引用能追溯查询、平台、时间。
- 引用检测可以独立重试。

### 阶段 6：定时监控和告警

目标：

- 持续监控网站可见性变化。

范围：

- monitor config。
- cron 扫描。
- 告警规则。
- 站内通知。

验收：

- 定时任务可恢复。
- 多 worker 不重复执行同一任务。
- 分数大幅下降时生成告警。

### 阶段 7：额度、权限和商业化增强

目标：

- 让功能可控、可计费、可扩展。

范围：

- 额度消耗。
- 订阅分层。
- 角色权限。
- 成本报表。
- 企业配置。

验收：

- 不同订阅层看到不同能力。
- 高成本功能不会被无限调用。
- 管理员可以查看使用情况。

## 24. 推荐最终 MVP 范围

为了尽快落地，建议第一轮开发只做以下内容：

1. `POST /api/integration/product-website/analyze`
2. `GET /api/integration/product-website/:id`
3. 上游基础抓取和 HTML 抽取
4. 7 维评分，包括 `productClarity`
5. Top 10 优化建议
6. 项目页或 visibility 页展示最近一次结果

第一轮不要做：

- PDF
- 趋势
- 定时监控
- 真实 AI 引用
- 公开免费检测
- 单次付费报告

原因：

- MVP 可以验证用户是否需要“产品网站自身可见性”这个视角。
- 评分和建议的准确性比导出和监控更早决定产品价值。
- 真实 AI 引用检测成本和不确定性最高，应该在基础分析稳定后接入。

## 25. 后续拆任务建议

可以按以下任务包进入实现：

### Task Pack A：上游基础能力

- 新增 product website analysis 数据表。
- 实现 URL 校验和 SSRF 防护。
- 实现抓取和 HTML 抽取。
- 实现基础评分。
- 实现建议生成。

### Task Pack B：平台代理

- 新增 integration routes。
- 读取项目产品字段和品牌关联。
- 调用上游 create/get。
- 处理 upstream timeout 和错误映射。
- 可选落 mirror 表。

### Task Pack C：前端 MVP

- 增加入口按钮。
- 增加状态展示。
- 增加分数总览。
- 增加页面摘要。
- 增加建议列表。

### Task Pack D：趋势和报告

- Snapshot 表。
- 趋势 API。
- 报告 API。
- HTML 报告页。
- PDF 导出。

### Task Pack E：真实 AI 引用和监控

- 查询生成。
- 平台检测器。
- 引用匹配。
- 定时监控。
- 告警。
