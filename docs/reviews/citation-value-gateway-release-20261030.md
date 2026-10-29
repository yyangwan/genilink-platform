# CHAO 网关发布记录

日期：2026-10-30。用户授权“部署一下”。本次仅发布设备网关；门户、审计后端与 ContentOS 未发布，门户共享版本保持 0.5.0.1。

**已部署并核验，网关发布身份：`4e54e0c89e60d963a7bb65dc702e89554ba956b5`。**

- [PR #62](https://github.com/yyangwan/genilink-platform/pull/62) 已 squash 合并；包括启动期限/锁定处理、千问观察元数据、活动租约部分结果保留，以及四 App 适配。
- [PR CI](https://github.com/yyangwan/genilink-platform/actions/runs/40973938737) 与 [落地提交 CI](https://github.com/yyangwan/genilink-platform/actions/runs/40974400097) 的范围分类、双 PowerShell 网关检查均通过。浏览器解析测试通过；云构建、镜像、部署任务均按范围跳过。
- 本地发布前再次通过 PS5.1、PS7 完整网关门禁（每引擎 230 项弹窗断言及输入/来源回归）、独立依赖安装和 Node 16 项测试。README 已同步。
- 由落地 SHA 的 `git archive` 生成精确包，仅含 10 个变更运行文件；压缩包传输哈希、解包文件哈希、PowerShell 语法在 CHAO 校验后才更新。

## 更新及运行核验

更新前服务端确认活动租约为零；SYSTEM 工作器连续检查空闲，停止 Agent 后取得 `Global\MobileGatewayAgent` 互斥，再备份、复制、校验和恢复 Agent。

| 项目 | 实测结果 |
| --- | --- |
| 运行文件 | 10 个与发布清单 SHA-256 一致 |
| 原文件备份 | 10 个哈希复验通过；无需删除新增运行文件 |
| 私有配置 | 更新前后哈希相同；设备顺序、接收器允许列表和凭证保留 |
| 浏览器 | 未覆盖 profile/登录，服务端 browserReady=true |
| Agent | 单实例恢复；服务端收到晚于重启时间的新心跳，状态 online |
| 手机 | 配置内 5 台在线；服务端完整快照还包含其他设备，不将其混入配置池计数 |
| Appium | ready；进程创建时间早于发布，未重启 |
| 资源 | 07:46 健康记录：磁盘约 382.8 GB 可用，内存约 21.77 GB 可用 |

07:41:34 出现一次 `poll failed: fetch failed`。后续已收到 07:43:56 的服务端新心跳，网关在线、浏览器可用；此错误未重复出现在核验日志中。记录为已恢复的短暂网络异常，不隐去错误，也不将它误判为文件更新失败。

## 回执和回滚

CHAO 保留：

```text
C:\ProgramData\MobileGateway\releases\4e54e0c89e60d963a7bb65dc702e89554ba956b5-20261030\receipt.json
C:\ProgramData\MobileGateway\releases\4e54e0c89e60d963a7bb65dc702e89554ba956b5-20261030\backup
C:\ProgramData\MobileGateway\releases\active.json
```

备份只含本次覆盖的运行文件及原哈希，不包含通用私有配置备份。回滚需同样在空闲 SYSTEM 互斥窗口使用该发布工作器的 Rollback 模式，恢复已核对的原文件，核验 Agent/心跳后，再将 active.json 与 previous/原运行文件状态对齐；旧提交身份未知时明确保留未知，不继续标成新提交。没有实际执行回滚，不声称回滚演练通过。

## 验收边界

发布和运行检查已完成，**没有发起新的四 App 采集**。DeepSeek 实际新输入、PDF 窗口层级/继续采集、Kimi/元宝新路径以及千问新元数据仍需新采集核验；此前失败/部分审计未改写。代码上线和新心跳不等于四平台完整采集、文章全文、独立语义或优化建议价值已经通过。Q01/Q02 继续未验收。
