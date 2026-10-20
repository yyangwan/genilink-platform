# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0.1] - 2026-10-21

### Fixed
- Harden mobile capture with conservative upgrade-dialog dismissal, protected-popup interruption evidence and partial-result retention.
- Fix device cooldown persistence, interactive browser readiness, Doubao source-list layout handling and Kimi answer-progress detection.

## [0.4.0.0] - 2026-10-20

### Changed
- 将智見分析主导航与八个页面统一到已确认的引用情报原型：审计洞察、平台差异对照、品牌发现对比、来源文章库、观点与证据、优化行动、内容创作方案、行动效果复测。
- 审计记录和采集页进入对应审计的新版洞察；旧分析地址跳转到新工作台，报告详细分母与 PDF 保留为独立附录。
- 按文章归并来源观察，保留分平台诊断和未登记实体；在分析或正文不足时明确展示数据缺口，避免输出没有证据支持的品牌结论。
- 将采集进度和分析决策分层，采集页聚焦任务状态，分析页按原型呈现真实审计数据。

## [0.3.3.2] - 2026-10-19

### Fixed
- 可见性分析页对最新审计也读取完整分析工作台，确保来源与证据页签显示真实来源明细，而非仅有首页概览统计。

## [0.3.3.1] - 2026-10-19

### Fixed
- 当本次审计没有成功分析任何字符时，将后端的数据缺口诊断归为分析修复事项，不计作品牌优化建议，也不显示行动审批入口；仍可查看来源证据及运行诊断。

## [0.3.3.0] - 2026-10-19

### Added
- 可见性分析页在当前审计下直接展示结果总览、分平台比较、来源证据与优化行动，提供平台筛选和原文入口。
- 采集任务显示阶段状态、分平台进度及本次打开页面后观察到的状态变化，分析修订就绪后自动更新。

### Fixed
- 新采集任务与历史审计严格按审计编号读取，避免展示上一轮结论；解析覆盖为零时明确提示无法判断品牌表现。
- 采集设置移至页面顶部入口，去除概览中要求客户选择采集平台的旧文案。

## [0.3.2.0] - 2026-10-18

### Fixed
- 采集设置只保留提示词和轮次，由服务端统一覆盖五个平台，隐藏采集端选择与实现细节。
- 补齐审计分析、报告、对比、建议和复测中的平台图标，沿用统一的平台名称及别名映射。

## [0.3.1.1] - 2026-10-18

### Fixed
- 当前修订正在分析时优先显示执行状态，避免下一次刷新排期将它误显示为未执行。

## [0.3.1.0] - 2026-10-18

### Fixed
- 采集进度和概览明确区分排期等待、执行、失败与部分结果，并展示来源正文和链接缺口。
- 千问过滤纯思考状态文字；采集网关对无可用设备报告独立错误，以保留等待退避。

## [0.3.0.1] - 2026-10-18

### Changed
- 统一审计分析控件指针与状态样式，将九项分析功能归入四组导航。
- 增加持续采集进度、分平台计数、查询中断恢复及审计上下文链接。
- 折叠采集设置，使用模态抽屉阅读原文，并优化来源和平台信息层次。

## [0.3.0.0] - 2026-10-17

### Added
- 逐平台引用分析、所有观测实体对比、来源正文证据、人工复核、行动材料、固定复测与在线/PDF报告。
- 项目品牌身份关联、持久上下文同步与每分钟重试调度；新版采集契约与人工内容任务入口。
### Fixed
- 成功创建采集后再次操作使用新幂等键；失败结果未知时保留原编号。
- 更新五项已审核的阿里云订阅通知短信模板。
### Deployment
- 新分析服务使用专用数据库和 OSS；ContentOS 先部署，前端通过既有 SHA 镜像蓝绿管道切换。
- 历史测试审计不兼容回填；质量评测与真实采集验收独立于部署状态。

## [0.2.0.10] - 2026-09-26

### Added
- Visitors can start a product website analysis from campaign landing pages, continue through registration, and keep their acquisition context through checkout.
- Enterprise buyers and agency partners can submit encrypted contact requests, withdraw consent, and have their contact data deleted without waiting for an operator.
- Operations users can review leads, funnel performance, catalog status, and role assignments from protected internal pages.
- Search engines can discover public marketing pages through canonical metadata, robots rules, and an XML sitemap.

### Changed
- Public pricing now shows the production Lite, Pro, and Max monthly and yearly prices from the same catalog used by checkout.
- Product website analysis retries use stable request keys, reserved usage, and upstream recovery so network failures cannot create duplicate work or charges.
- Production deployment validates marketing secrets, retention settings, webhook security, and upstream idempotency support before enabling acquisition traffic.

### Fixed
- Lead delivery is canceled when consent is withdrawn, including jobs already waiting in the delivery queue.
- Payment attribution, analysis recovery, and marketing maintenance can resume safely after interrupted requests.

## [0.2.0.9] - 2026-09-04

### Fixed
- Zhichuang content insights now shows content-production performance, quality, status, and publishing-platform data instead of opening Zhijian audit intelligence.

## [0.2.0.8] - 2026-09-03

### Fixed
- WeChat Pay and Alipay can now sign requests when payment keys are configured with escaped newline characters, preventing checkout from failing with an OpenSSL decoder error.

## [0.2.0.7] - 2026-09-03

### Added
- Subscription pages now offer a custom plan for managed operations, outcome-based cooperation, private deployment, and tailored integrations, with a direct customer-service contact path.

### Changed
- All Lite, Pro, and Max monthly and yearly plans use a CNY 1 internal-beta price for end-to-end purchase testing.
- Public pricing copy now helps customers choose a plan by team stage and use case instead of describing internal payment or configuration details.

## [0.2.0.6] - 2026-09-02

### Fixed
- Unsubscribed workspaces can reach the subscription guidance flow reliably after container signing-key permissions are normalized and validated during deployment.

## [0.2.0.5] - 2026-09-01

### Added
- Subscription-gated modules now show a consistent explanation with a direct link to subscription plans.

### Changed
- Dashboard visibility, GEO, and content summaries now preserve the `NO_SUBSCRIPTION` state instead of returning misleading empty data.
- Audits, trends, content insights, optimization suggestions, competitor comparison, strategic intelligence, content management, calendar, brand voice, and template pages distinguish subscription access from system failures.

### Fixed
- First-project workspaces without an active plan no longer show generic loading failures across protected modules.

## [0.2.0.4] - 2026-09-01

### Fixed
- Project creation now validates a saved workspace against the current account before deciding whether onboarding is required, preventing stale cookies from causing `No workspace selected` for newly registered users.

## [0.2.0.3] - 2026-08-31

### Changed
- Routine releases now use a compact local gate runner that keeps successful logs quiet and avoids duplicate review and verification work.

### Fixed
- First-time users can now create their first project from any empty-state project setup prompt without hitting a missing workspace error.
- The project creation wizard now initializes the workspace when needed and refreshes the page context after the first project is created.

## [0.2.0.2] - 2026-08-31

### Added
- Users who registered by phone can enable a separate email-and-password login identifier after confirming their current phone by SMS.
- Password authentication now has atomic account and IP rate limits shared across all application instances.
- Production releases validate and apply Prisma migrations from the immutable container image before blue/green traffic switching.

### Changed
- Account login settings now provide clear loading, retry, SMS resend, mobile layout, and accessible status feedback.

### Fixed
- Creating a project from a first-use empty state no longer passes the click event as a project identifier and fails with `Project not found`.
- Session refreshes now reload trusted profile fields from the database instead of accepting client-provided identity claims.
- Expired credential rate-limit buckets are reclaimed safely without racing active login windows.

## [0.2.0.1] - 2026-08-28

### Changed
- First-time users now see guided project setup states on the dashboard, brand voice, and content template pages instead of blank or indefinitely loading content.
- Empty brand management now explains how the first brand powers audits, competitor comparisons, and content creation.

### Fixed
- Project-scoped dashboard requests no longer run before a project is selected.
- Users with existing projects but no active selection are prompted to choose a project instead of being shown misleading empty data.

## [0.2.0.0] - 2026-08-21

### Added
- Customers can configure WeChat, Xiaohongshu, Douyin, Weibo, Toutiao, and Zhihu independently for the current login account and project.
- Every platform now includes step-by-step credential guidance, official console links, and locally served official product icons.
- Added regression coverage for platform route validation, credential redaction, account/project scope, and the redesigned settings experience.

### Changed
- Rebuilt the publishing settings page with per-platform status cards, a focused configuration drawer, connection maintenance actions, and clear account/project scope messaging.
- Platform responses expose credential-presence flags while keeping secrets and access tokens out of browser responses.

### Fixed
- Unsupported publishing platform identifiers are rejected before reaching the content service.
- Platform configuration payloads are validated and stripped of spoofed user or workspace fields before proxying.

## [0.1.0.1] - 2026-05-20

### Fixed
- Prevented parameter injection in prompts/generate route — user body can no longer override server-resolved `project_id` (adversarial review finding)
- Audits page no longer fires spurious fetch before `projectId` is resolved — passes `null` URL instead of fallback
- `useSectionFetch` hook now accepts `string | null` URL with null guard to skip fetch

### Added
- Test coverage for `useSectionFetch` null-URL guard (4 tests)
- Test coverage for `prompts/generate` route: auth, billing, mapping, upstream errors, auto-create, project_id body assertion (14 tests)
- TODOS.md tracking design system, accessibility, security, and test infrastructure work

### Changed
- CLAUDE.md status updated to reflect design review completion and next steps
- `prompts/generate` route now explicitly includes `project_id` in upstream request body
