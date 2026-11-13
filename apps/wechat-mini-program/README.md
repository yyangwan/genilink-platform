# 智链官网快检小程序

微信原生 WXML、WXSS 和 TypeScript。访客可检查一个公开首页。验证手机号后，可以绑定或开通智链账号，保存报告并在网页端继续使用。

## 开发

从仓库根目录执行类型检查。

```powershell
& ./node_modules/.bin/tsc.cmd -p apps/wechat-mini-program/tsconfig.json
```

用微信开发者工具打开 `apps/wechat-mini-program`。工程已配置智链小程序 AppID，预览和上传需使用有该小程序开发权限的微信账号。开发版可在「我的」页选择本地 API `http://127.0.0.1:3001`。体验版与正式版默认使用 `https://genilink.cn`，上传预发体验版时应把预发 HTTPS 域名配置成该构建的 API 地址，并在微信后台登记。

## 联调

- 智链配置 `MINI_PROGRAM_APP_ID`、`MINI_PROGRAM_APP_SECRET`、`MINI_PROGRAM_QUICK_CHECK_ENABLED`、`MINI_PROGRAM_BINDING_ENABLED` 和现有短信服务。在微信公众平台开通手机号快速验证、完成隐私保护指引配置并验证后，开启 `MINI_PROGRAM_WECHAT_PHONE_ENABLED`。已授权的新手机号可直接开通智链账号。已有账号和拒绝授权的用户仍可选短信。保存的结果可在 `/quick-checks` 查看。
- 智链配置 `WEBSITE_QUICK_CHECK_SERVICE_URL` 为分析服务内网地址，`WEBSITE_QUICK_CHECK_SERVICE_SECRET` 与分析服务的 `AISCOPE_WEBSITE_QUICK_CHECK_SERVICE_SECRET` 一致。外部流量只访问智链小程序 API。
- 联调品牌实测时，启用现有线索开关并使用测试运营队列。归因和清理复用营销维护任务。
- 发布前使用真实 AppID 验证 iOS、Android 微信登录、短信、拒绝授权、报告认领、同账号网页读取和分享。用具有公网 DNS 的预发环境复测 20 个公开首页的可用率与耗时。

[开发方案](../../docs/designs/wechat-mini-program-acquisition-development-plan.md)
