---
status: review-complete-with-concerns
branch: codex/content-workflow-v1
timestamp: 2026-09-10T13:04:06+08:00
---

# 智见建议到智创内容工作流：实现对照评审

## 结论

DONE_WITH_CONCERNS。主流程已有实现，但不符合设计 §22、§25 的完成定义，建议修复后再发布。确认 14 项问题：7 项 P1、7 项 P2。P1 是本轮建议的发布阻断项。未修改业务代码、未提交、未评论 PR、未部署。

评审基准：[技术设计 V1](E:/workspace/genilink-platform/docs/zhijian-to-zhichuang-content-workflow-design.md)。遵守用户前提：平台未公开，无需历史迁移、旧接口兼容或双链路运行；不把缺少兼容作为缺陷。该前提不等于授权删除数据，也不等于取消故障停用与恢复。

| 仓库 | 本次审查 HEAD | 比较基线 |
|---|---|---|
| Portal | `00dfe71a57f4aaf19b943a7dbd7b7b0e53865c5d` | `492f58591b7c6dd263a427a58a1fc1b6e679ea39` |
| ContentOS | `37f401eb9d4e3194106ffbaa65752b1dde205de8` | `d65543c7bb252c26293401526ba7bc63d956229a` |

评审时 Portal PR #24 为 OPEN；查询时 source build、Docker build 检查通过，production deploy 为 skipped。这不是生产已上线的证明。

## 发布阻断项

### R1 [P1，置信度 10/10] 已领取任务无法在重启后接管

证据：[生成 worker](E:/workspace/marketing/src/lib/content-workflow/worker.ts:82) 只选择 `status: { in: ["queued", "failed_retryable"] }`，领取后第 127 行置 `generating`。第 425 行异常处理仅调用 `releaseLease(...)`，该函数只清锁，不恢复状态。[提炼 worker](E:/workspace/marketing/src/lib/content-brief/refinement-worker.ts:50) 同样只取 `refinementStatus: "queued"`，第 66 行置 `running`，没有过期 running 恢复路径。

进程重启、部署切换、领取后数据库异常，都能留下永久 generating/running。生成任务还会一直占用工作流并发计数。Brief 基础版虽仍可用，后台提炼不会完成。违反 §9.3、§12.4、§19.5。

修复验收：实现过期任务检查与接管；模型是否已经请求必须区分，不能简单把全部过期任务重新调用模型。增加“调用前退出、调用后退出、写结果前退出”三种故障测试，并验证无法确认供应商结果时进入人工确认状态。

### R2 [P1，置信度 10/10] 用户先编辑、worker 后领取时仍会覆盖用户修改

证据：[refinement-worker.ts](E:/workspace/marketing/src/lib/content-brief/refinement-worker.ts:126)：`const baseline = parseBrief(row.effectiveBrief);`；发布条件第 191 行是 `revision: row.revision`。[PATCH](E:/workspace/marketing/src/app/api/content-briefs/[id]/route.ts:238) 设置 `effectiveSource: "user"`，但没有取消 queued refinement 或冻结最初的 refinementBaseRevision。

用户将 Brief 保存为 revision 2，之后 worker 才领取，worker 就把用户版和 revision 2 当成新提炼基线；发布比较仍相等，AI 会替换用户标题、大纲和备注。重试间隔中编辑也一样。现有测试仅验证 worker 已启动之后的用户编辑。违反 §7.2、§8.5。

修复验收：固定提炼的原始版本，保护用户已经编辑/确认的字段；覆盖“领取前编辑、重试间隔编辑、生成确认后迟到结果”场景。

### R3 [P1，置信度 10/10] 不确定的 503 响应会丢掉幂等键，重试可能重复创建和扣额

证据：[Portal BFF](E:/workspace/genilink-platform/src/app/api/content/workflows/route.ts:150) 在上游 5xx 情况标记 `pending_reconcile` 并返回 503，说明创建结果未确定；[新建页](E:/workspace/genilink-platform/src/app/(dashboard)/content/new/page.tsx:422) 在检查非成功响应前无条件执行 `submitKeyRef.current = null`。下一次点击第 396 行产生新 UUID。

若 ContentOS 已提交工作流但返回 5xx，第二次点击会用新 operationId 创建第二个工作流，随后两次计费。键又仅存在 `useRef`（第 131 行），刷新会丢失，违背 §16.1、§22.1 的刷新/网络重试不重复创建要求。202 uncertain 分支只有提示，没有自动恢复查询。

修复验收：不确定响应保留原操作身份和原请求快照，刷新后可恢复；通过该操作查询或安全重放找回 workflowId。增加“服务端已提交但返回 503、响应丢失后刷新”的跨服务测试。

### R4 [P1，置信度 10/10] 旧请求重放可能误释放已经受理的工作流额度

证据：[ContentOS service](E:/workspace/marketing/src/lib/content-workflow/service.ts:109) 先校验当前 Brief revision，第 141 行才查已有幂等工作流。Portal [workflows route](E:/workspace/genilink-platform/src/app/api/content/workflows/route.ts:142) 对任意 4xx 执行 `releaseUsageOperation(...)`。[账本](E:/workspace/genilink-platform/src/lib/billing/usage-reservations.ts:210) 允许 reserved/pending_reconcile → released，commit 不接受 released。

复现时序：工作流已受理但尚未 commit → 响应丢失 → 另一页面编辑 Brief → 原 key/body 重放 → 当前 revision 校验返回 409 → Portal 释放原工作流预占 → 原 worker 永久无法提交额度。违反 §7.3、§12.1、§12.5。

修复验收：授权后优先识别已有操作并返回原结果；重放 4xx 不能直接证明原操作从未受理，释放前必须确认原操作状态。

### R5 [P1，置信度 10/10] 质量门允许虚构客户、认证和链接进入后续生成

证据：[quality-gates.ts](E:/workspace/marketing/src/lib/content-brief/quality-gates.ts:220) Gate 8 实际只检查数字记号：`for (const n of extractNumbers(text)) candidateNumbers.add(n);`。候选文本没有链接白名单与非数字事实校验。[refinement.ts](E:/workspace/marketing/src/lib/content-brief/refinement.ts:121) 直接合并 `notes: candidate.notes`，随后 [to-generation-brief.ts](E:/workspace/marketing/src/lib/content-brief/to-generation-brief.ts:58) 将其传入正文生成。

专项评审用仓库 golden baseline/create-request fixture 做了纯内存复现：主题保持项目锚点，notes 为“已获得权威认证，客户包括微软与阿里巴巴；参考 https://invented.example/case”，得到 `{ok:true, violations:[]}`。这是测试输入，不是对项目的事实描述。违反 §11.4 第 4、8 条。

修复验收：候选所有文本字段中的链接必须来自允许来源；客户、认证、案例、价格等新声明必须可追溯，无法证实时拒绝候选并保留基础版。不能仅靠提示词保证。

### R6 [P1，置信度 10/10] 普通“新建内容”入口已不可用

证据：[new/page.tsx](E:/workspace/genilink-platform/src/app/(dashboard)/content/new/page.tsx:122) 初始化 `platformPlan=[]`，无 briefId 时第 149 行直接跳过加载；平台点击第 270 行只有 `prev.map(...)`，无法向空数组加入平台。第 619 行 `selectedPlatforms.length === 0` 永久禁用提交。

概览仍提供“新建内容”入口。用户手工输入主题后无法选择任何平台、无法创建草稿。这是本次重构引入的现有入口回归，不是要求恢复历史接口兼容。

修复验收：手工模式初始化可用平台，或完成统一手工 Brief 创建流程；增加不带 briefId 的完整创建测试。

### R7 [P1，置信度 10/10] 设计要求的故障停用不存在，运行手册的停用步骤无效

两仓业务代码没有 `CONTENT_BRIEF_WORKFLOW_V1` 或等价入口/worker 暂停控制。[创建路由](E:/workspace/marketing/src/app/api/content-workflows/route.ts:70) 无条件 `void runGenerationBatch(...)`，重试路由也直接 kick；Brief 创建同样 kick 提炼。

[运行手册 §7](E:/workspace/genilink-platform/docs/content-workflow-runbook.md:73) 声称停 cron 即停生成，且 inline kick 会因额度回调失败而不生成；但停 cron 不会使正常 Portal 回调失败。新请求仍可创建并消耗模型。违反 §20、§21，用户取消兼容要求并未取消这个开关。

修复验收：同时具备“拒绝新提交”和“暂停领取”的可验证控制，覆盖 cron 与 inline 路径；已保存状态保留，恢复后可继续。运行手册必须描述真实可执行的停用/恢复步骤。

## 其他确定性问题

### R8 [P2，置信度 10/10] PATCH 的幂等键只检查存在，不做重放

[ContentOS PATCH](E:/workspace/marketing/src/app/api/content-briefs/[id]/route.ts:137) 只调用 `getIdempotencyKey(req)` 判空，第 247/251 行按旧 revision 条件写入并递增，没有保存操作键或请求哈希。Portal [客户端](E:/workspace/genilink-platform/src/lib/content/contentos-brief-client.ts:161) 对 PATCH 配置 `retries: 1`。

首次保存成功但响应断线，自动重试就返回 409，用户误以为其他页面冲突。应返回首次保存结果，并校验同键不同请求。验收：保存后响应丢失，仅写一次且返回成功回放。对应 §10.4、§12.1。

### R9 [P2，置信度 10/10] Brief 版本确认失败仍提交工作流

[service.ts](E:/workspace/marketing/src/lib/content-workflow/service.ts:207) 执行 `await tx.contentBrief.updateMany({ where: { id: brief.id, revision: brief.revision }, ... })` 后不检查 count。Brief 在事务外读取；读取后并发 PATCH 导致 count=0，ContentPiece、Workflow、Run 仍提交，并按旧版本生成计费，而不是返回版本冲突。应让版本确认失败回滚整个创建事务。对应 §10.5、§12.2。

### R10 [P2，置信度 10/10] 自动重试等待中被误判为终态

[status.ts](E:/workspace/marketing/src/lib/content-workflow/status.ts:29) 把 `failed_retryable` 和 `failed_terminal` 一起计为失败，第 36 行返回 `failed`。worker 随即写 completedAt 和 completed 事件，虽然任务仍有 nextAttemptAt 等待自动重试。

用户页面因此提前停止轮询，完成/失败指标也失真。应区分“正在退避等待”和“最终失败”，未耗尽自动重试时不结束工作流。对应 §9.2、§15。

### R11 [P2，置信度 10/10] 人工重试后进度页不会重启轮询

[进度页](E:/workspace/genilink-platform/src/app/(dashboard)/content/workflows/[id]/page.tsx:69) 终态不再安排定时器；第 101–102 行重试成功仅执行 `terminalRef.current = false; setData(...)`。effect 依赖第 77 行没有这些状态，也没有显式启动新的 poll。

失败/部分成功 → 点击重试后页面一直显示排队，必须手工刷新。即使修复 R10，此问题仍独立存在。应使重试结果驱动轮询恢复。对应 §16.3。

### R12 [P2，置信度 10/10] 额度回调超时只覆盖响应头

[portal-usage-client.ts](E:/workspace/marketing/src/lib/billing/portal-usage-client.ts:49) 在 fetch 返回响应头后 `clearTimeout(timer)`，第 62 行才 `await res.json()`。响应体停滞时 worker 长期占用执行槽，而且尚未进入生成阶段的续租逻辑。应让超时覆盖完整响应体读取。对应 §13.2。

### R13 [P2，置信度 9/10] 声明的模型并发上限不能在并发 kick 时保证

[worker.ts](E:/workspace/marketing/src/lib/content-workflow/worker.ts:401) 检查 `inFlight >= MAX_INFLIGHT_LLM`，随后第 405 行 await 领取，直到第 413 行才 `inFlight += 1`。多条并发请求都能在 await 前通过检查，分别领取不同任务后超过四个。工作流 count 第 112 行与 claim 第 117 行也非同一原子操作，跨实例可能超过每工作流两个。

应在异步领取前原子占用实例槽位，并保证工作流级并发名额的互斥；增加并发调用测试，不仅顺序 mock。对应 §7.4、§12.4。考虑此前资源耗尽历史，此项应与 worker 修复一起处理。

### R14 [P2，置信度 10/10] 切回 Brief 原项目后无法恢复编辑页

[new/page.tsx](E:/workspace/genilink-platform/src/app/(dashboard)/content/new/page.tsx:156) 错项目 GET 设置 loadError，成功分支第 162 行仅 applyDetail，不清除错误；第 500 行错误优先返回。

A 项目 Brief → 切 B 被拒绝 → 切回 A 后 GET 成功，但仍显示错误直到整页刷新。应在重新加载成功时重置错误，同时保持跨项目禁用。对应 §16.2。

## 设计覆盖审计

Scope Check: REQUIREMENTS MISSING。以下是功能块级审计，不以文件存在代替端到端完成，也不把线上未验证当作已完成。

| 设计项 | 结论 | 证据/缺口 |
|---|---|---|
| §7.1 服务端重新取规范建议 | DONE | Portal canonical-suggestion 按当前项目取建议，浏览器正文白名单限制已实现 |
| §8.2 Brief 持久化与项目绑定 | DONE | ContentOS ContentBrief、项目限定查询、PATCH 字段白名单 |
| §5.3 规则基础版先返回 | DONE | ContentOS 同步 baseline 入库后异步 kick |
| §18 双仓契约 | PARTIAL | 本次 schema manifest/hash 一致；各 CI 仅核对本仓文件对本仓 manifest，不保证未来跨仓一致 |
| §11.4 提炼质量与编辑优先级 | PARTIAL | 有规则/质量门/版本条件，但 R2、R5 |
| §8.3 输入限制 | PARTIAL | source-snapshot 先 dedupe/filter 截断数组再 assert，不能按设计对所有超限输入返回 422；用户/模型文本也有先 slice 后校验 |
| §8.6 唯一不可变生成快照 | PARTIAL | 保存 briefSnapshot，但 worker.ts:259 仍读 JSON.parse(piece.brief)，service 双写派生旧 Brief；尚未完成快照唯一输入改造 |
| §10.4 编辑幂等 | PARTIAL | revision 条件写存在，操作回放缺失，见 R8 |
| §10.5 工作流事务创建 | PARTIAL | 一事务创建 Piece/Workflow/Run，唯一约束存在；R4、R9 |
| §5.6/§12.3 额度账本 | PARTIAL | Serializable reserve、commit/release、pending_reconcile 已有；不确定结果闭环 R3、R4 未完成 |
| §12.4 worker 可恢复租约 | PARTIAL | 领取、续租、租约字段存在，但 R1、R13 |
| §13.2 全生命周期超时 | PARTIAL | 新 Portal 客户端覆盖 body；ContentOS 回调仍有 R12 |
| §16.2 完整确认页面 | PARTIAL | topic/outline/references 有；strategy 目的/意图未展示；locked/editable 合并标成锁定，不能编辑用户约束；R6、R14 |
| §16.3 平台进度与恢复 | PARTIAL | 视图与 retry 接口存在，R10、R11 |
| §20/§21 停用、暂停、恢复 | NOT DONE | 无控制开关，停 cron 无法挡住 inline kick，见 R7 |
| §19.3–19.5 跨服务、E2E、故障注入 | PARTIAL | 单测存在且通过，未见覆盖上述异常时序的真实双服务/数据库故障测试 |
| §14 内部额度回调鉴权 | CHANGED | 实现共享 Bearer secret + timingSafeEqual/fail-closed，非设计的 audience JWT；运行手册标为 D8 偏差，不仅因形式不同定安全漏洞，需将正式设计同步到确认过的决策 |
| §20 发布顺序、cron 注册、24h 指标 | UNVERIFIABLE | 有运行手册；本次未登录生产、未执行部署、未核查外部调度器及监控配置 |

另：templateId 在 ContentOS service.ts:131 仅校验存在与归属，未保存或交给生成器，UI 选择模板不影响工作流正文。此项应补实现或明确移除选择入口。当前提示词消费了 must/avoid/claims 的转换值，因此不把整个约束链路描述为完全未实现。

设计自身需要同步的两处不一致：§19.3 仍写约束进入 ContentPiece.brief，而 §8.6/§17.2 已明确改为 workflow 快照；§12.4 提及 needs_review，但 §9.3/契约枚举没有这个状态。应先统一，再落实恢复测试。没有把这两处文档矛盾冒充新增代码缺陷。

## 验证与覆盖限制

- 主评审运行 Portal 8 个相关测试文件，83/83 通过：usage-reservations、content-workflows-route、content-briefs-from-suggestion-route、content-briefs-id-route、contracts、source-snapshot、canonical-suggestion、content-usage-internal-routes。
- Worker 专项运行 ContentOS worker/service/status/refinement-worker 4 文件，32/32 通过。
- Brief 专项运行 ContentOS quality-gates/refinement-worker/contracts 3 文件，37/37 通过。与上一组有重叠，不相加宣称独立总数。
- 专项纯内存复现 R5，质量门错误接受候选。
- 本轮没有运行完整 release:check、真实双数据库并发、浏览器 E2E、生产烟测或付费模型调用。通过的 mock 单测不证明这些边界安全。
- review 技能的 testing、maintainability、security、performance、data-migration、api-contract、design、simplification 合并为三个限定范围的专项检查。额外 adversarial/red-team 调用因账户 usage limit 失败，因此不计为完成覆盖。未嵌套调用 Codex CLI。
- 可选简化：new/page 的 handleSave/handleSubmit 重复 PATCH 构造与处理可统一；非缺陷，不计入 14 项。

## 后续修复顺序

1. 先修 R1–R7；R12、R13 与 worker 改造一起处理。
2. 修 R8–R11、R14，并补齐快照唯一输入、模板、确认字段和超限校验。
3. 增加上文逐项故障回归，特别是已提交后丢响应、跨服务重放、用户先编辑后提炼、崩溃接管、并发名额及重试进度。
4. 本地 gate、两个 PR CI 通过后，按仓库标准 ContentOS 先、Portal 后发布；不能在生产直接改代码或手工构建。
5. 上线前核实 cron、共享回调密钥、入口停用、暂停恢复与指标；任何测试数据删除另行核对范围与授权。

本报告于 2026-09-10 从评审检查点归档至工作空间 docs 目录，结论对应上表所列提交，不表示对后续代码的重新评审。全部发现保持 unresolved；后续按 R 编号记录修复提交、回归测试和复核结果。此次仅保存文档，未修改业务代码、提交或部署。
