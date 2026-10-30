# 四 App 采集适配修复：本地验证记录

日期：2026-10-29。用户要求“修正一下吧”，中断后继续完成。网关本地提交：`8a660dadf0ccdf35ade60007a99a8cd33132587b`，父提交 `185c074c22739aa432dfd84126a3f10dee38afbf`。

**本轮完成代码修复与本地验证，尚未发布到 CHAO，没有新的真实采集成功记录。** 仍以此前四 App 失败、千问另一审计中部分封存的事实作为实机验收状态。

## 修复内容

| 平台 | 已确认原因 | 本地实现 |
| --- | --- | --- |
| Kimi | 实机 3.1.5 已显示正常输入页，旧脚本仍按旧占位文字定位 | 从当前应用中选择唯一、有效、非密码的原生编辑框；不依赖占位文字，拒绝外部应用、WebView 和多个候选；新占位文字不混入回答抽取 |
| DeepSeek | 进入会话后 `mobile: setClipboard` 客户端超时，后端继续等待 240 秒，问题未发送 | 此平台不再创建 UiAutomator2 会话或经该剪贴板接口输入；使用已安装的 UnicodeIME、按完整 Unicode 字符分段输入，原生操作有期限，恢复并核对原输入法和启用状态；完整问题必须出现在当前应用、聚焦的原生编辑框中，才能继续发送。仅在持有当前手机采集互斥后清理该手机的遗留 instrumentation，不重启共享 Appium |
| 元宝 | 原生更新面板是 FrameLayout，关闭 X 是无文字的 `id/skip` ImageView，旧分类器未识别 | 按实测应用包、标题、版本、升级按钮、关闭控件及边界匹配；只使用明确关闭控件，其他更新/登录/权限/未知窗口保持原拦截规则 |
| 豆包 | 引用跳转到 PDF 后，浏览器下载确认使整个来源流程停止 | 仅在当前来源解析上下文中，对限定原生浏览器 PDF 确认使用“取消”；返回来源列表后继续后续来源。有实际观察到的 HTTP URL 则保留，没有则标记 unavailable，不从文件名猜链接。相同来源在同任务的来源重试中不再反复打开；其他未知弹窗仍停止，但已保存的回答、目录和链接可保留 |

DeepSeek 的编码依据是 Appium 官方 [UnicodeIME 实现](https://github.com/appium/io.appium.settings/blob/master/app/src/main/java/io/appium/settings/UnicodeIME.java)，采用 IMAP modified UTF-7；与普通 UTF-7 不同。已确认测试手机安装该输入法，但本轮没有在实机执行新写入路径。不会将缺失的运行时应用版本补成配置常量。

豆包在打开来源前先记录实际引用目录、分母、标题、索引和已有链接；后续中断时可经上轮活动租约恢复机制保存。PDF URL 收集成功不等于 PDF 正文已抽取，未新增后端 PDF 解析能力。取消动作的测试使用依据实机截图构造的原生窗口夹具；真实 PDF 窗口层级和新路径效果仍需发布后验证。

## 验证与实际边界

- 新回归先复现旧 Kimi 定位失败、元宝窗口不识别，以及豆包遇下载弹窗中断整个来源列表。DeepSeek 旧路径的实机请求超时证据保留于上一份复测报告。
- 最终 Windows PowerShell 5.1、PowerShell 7 均通过完整 `deploy/mobile-gateway/test-release.ps1`。其中弹窗保护 230 项断言，输入/来源集成、设备选择/失败持久化、来源重试和既有平台回归均通过。
- 最终 `npm --prefix deploy/mobile-gateway/browser-runtime test`：16 passed、0 failed；`git diff --check` 通过，五个变更的 PowerShell 文件保留 UTF-8 BOM。
- 新输入回归覆盖中文、引号/命令元字符、emoji、长文本分段、原输入法恢复、超时恢复、完整草稿不一致/未聚焦时停止，以及依赖输入法缺失时不改变输入状态；通过 mock 原生命令验证，无真实问题发送。
- 新来源回归覆盖有/无实际 PDF URL、取消后继续后续来源、来源重试不重复打开 PDF、未知弹窗仍停止、引用目录及已知链接保留。没有把无链接来源算成链接收集成功。
- 用保存的真实 Kimi/元宝原生层级回放：Kimi 编辑框、元宝明确 skip 坐标均通过；这是保存材料回放，不是新一轮采集。
- 23:37 只读核验 CHAO：一个 SYSTEM Agent、零采集 worker、五台设备在线、Appium 状态可用、心跳新鲜，磁盘剩余约 383.1 GB。本轮未覆盖运行程序、重写私有配置、更新应用或修改设备池。
- 没有修改门户、审计后端或 ContentOS 产品源码，没有新模型调用、OSS 写入、push、PR 或部署。不因网关修改运行云服务发布门禁或重启云服务。

## 调试报告

| 字段 | 结论 |
| --- | --- |
| Symptom | 四 App 手动清理后仍无法完成正式采集 |
| Root cause | 过时的输入定位、未识别的具体更新面板、阻塞的剪贴板路径、下载型来源被当作全任务中断 |
| Fix | `handlers/research-app-common.ps1`、`gateway-popup-guard.ps1`、`handlers/doubao-app.ps1`，均位于 `deploy/mobile-gateway/` |
| Evidence | 双 PowerShell 完整门禁、浏览器 16 项、真实保存 UI 层级及输入/来源夹具回归 |
| Regression test | `test-popup-guard.ps1`、`test-popup-integration.ps1`；同属网关模块 |
| Related | 前序 67bde27 启动期限、2ecca98 千问观察元数据、185c074 活动租约部分结果保留，均仍待发布 |
| Status | DONE_WITH_CONCERNS：本地修复通过，真实新路径与完整采集待验收 |

下一步按独立网关 PR/CI、落地提交的精确归档、空闲 SYSTEM 互斥、备份/哈希与配置保护流程更新 CHAO，然后新建真实采集验证四平台及千问元数据。不得将本地回归当成实机成功，也不临时覆盖未落地代码来试修。Q02 与 release_eligible 继续保持未验收。
