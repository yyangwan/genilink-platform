import 'server-only';

import { QuickCheckError } from './quick-check-http';

/** Exchange a WeChat code server-side and discard the session key. */
export async function code2Session(appId: string, secret: string, code: string) {
  const endpoint = new URL('https://api.weixin.qq.com/sns/jscode2session');
  endpoint.search = new URLSearchParams({
    appid: appId,
    secret,
    js_code: code,
    grant_type: 'authorization_code',
  }).toString();

  let value: { openid?: unknown; unionid?: unknown; errcode?: unknown };
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000), redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new Error();
    value = await response.json();
    if (!value || typeof value !== 'object') throw new Error();
  } catch {
    throw unavailable();
  }
  if (value.errcode === 40029 || value.errcode === 40163 || value.errcode === 40226) {
    throw new QuickCheckError(401, 'INVALID_WECHAT_CODE', '微信登录凭证失效，请重试');
  }
  if (value.errcode && value.errcode !== 0) throw unavailable();
  if (typeof value.openid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value.openid)) throw unavailable();
  return {
    openId: value.openid,
    unionId: typeof value.unionid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value.unionid) ? value.unionid : undefined,
  };
}

function unavailable() {
  return new QuickCheckError(503, 'WECHAT_UNAVAILABLE', '微信登录暂不可用，请重试');
}
