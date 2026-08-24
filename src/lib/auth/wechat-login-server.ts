import { isWechatLoginEnabled } from "@/lib/auth/wechat-login-feature";

export function isWechatLoginServerEnabled(): boolean {
  return isWechatLoginEnabled(process.env.WECHAT_LOGIN_ENABLED);
}
