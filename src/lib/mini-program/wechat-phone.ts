import 'server-only';

import { normalizePhone } from '@/lib/auth/phone';
import { QuickCheckError } from './quick-check-http';

type Token = { value: string; expiresAt: number };
let cached: { appId: string; secret: string; token: Token } | undefined;
let pending: { appId: string; secret: string; request: Promise<Token> } | undefined;

function unavailable() {
  return new QuickCheckError(503, 'WECHAT_PHONE_UNAVAILABLE', '暂时无法获取微信手机号，可改用短信验证');
}

async function postWechat(url: string | URL, body: object) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data: unknown = await response.json();
      if (data && typeof data === 'object') return data as Record<string, unknown>;
    }
  } catch {
    // Provider details can contain credentials.
  }
  throw unavailable();
}

async function accessToken(appId: string, secret: string) {
  if (cached?.appId === appId && cached.secret === secret && cached.token.expiresAt > Date.now()) return cached.token;
  if (pending?.appId === appId && pending.secret === secret) return pending.request;
  const request = postWechat('https://api.weixin.qq.com/cgi-bin/stable_token', {
    grant_type: 'client_credential', appid: appId, secret, force_refresh: false,
  }).then((data) => {
    if (data.errcode || typeof data.access_token !== 'string' || !data.access_token
      || typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw unavailable();
    const token = { value: data.access_token, expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000 };
    cached = { appId, secret, token };
    return token;
  });
  pending = { appId, secret, request };
  try {
    return await request;
  } finally {
    if (pending?.request === request) pending = undefined;
  }
}

export async function getWechatPhone(appId: string, openId: string, code: string) {
  const secret = process.env.MINI_PROGRAM_APP_SECRET;
  if (!secret) throw unavailable();
  const endpoint = new URL('https://api.weixin.qq.com/wxa/business/getuserphonenumber');
  const redeem = (token: Token) => {
    endpoint.searchParams.set('access_token', token.value);
    // Ask WeChat to verify the phone code belongs to the authenticated OpenID.
    return postWechat(endpoint, { code, openid: openId });
  };
  const token = await accessToken(appId, secret);
  let data = await redeem(token);
  if ([40001, 40014, 42001].some((code) => data.errcode === code)) {
    if (cached?.token === token) cached = undefined;
    data = await redeem(await accessToken(appId, secret));
  }
  if (data.errcode === 40029 || data.errcode === 40163 || data.errcode === 40226) {
    throw new QuickCheckError(401, 'WECHAT_PHONE_CODE_EXPIRED', '手机号授权已失效，请重新授权');
  }
  if (data.errcode !== 0) throw unavailable();
  const info = data.phone_info as { countryCode?: unknown; purePhoneNumber?: unknown; watermark?: { appid?: unknown } } | undefined;
  if (info?.watermark?.appid !== appId) throw unavailable();
  const phone = info.countryCode === '86' ? normalizePhone(info.purePhoneNumber) : null;
  if (!phone) throw new QuickCheckError(400, 'WECHAT_PHONE_UNSUPPORTED', '请使用中国大陆手机号');
  return phone;
}
