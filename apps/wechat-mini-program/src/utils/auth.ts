/**
 * 账号体系：微信登录换会话、短信绑定/注册、网页扫码配对、登出。
 *
 * 会话语义：
 * 1) wx.login 拿 code → POST /auth/wechat/exchange；
 *    - 已绑定手机号 → 直接 signed_in；
 *    - 未绑定 → 返回 bindingToken，可用微信手机号开户、短信验证或网页扫码配对。
 * 2) 短信：/sms/send → /sms/verify（区分 link_existing / register）
 *    → /sms/confirm（register 必须显式勾选同意条款后才能提交）。
 * 3) 网页扫码：二维码里是明文 pairToken，SMS 验证通过后再调
 *    /auth/binding/pair/confirm 完成绑定（本端只负责 confirm）。
 */

import { ApiError, request } from './request';
import { readString, write, remove, StorageKeys, clearPrivateCache } from './storage';
import { resetVisitor } from './visitor';
import { takePendingClaims, claimQuickCheck, queuePendingClaim } from './api';

export interface SignedInEnvelope {
  status: 'signed_in';
  sessionToken: string;
  expiresAt: string;
}

export interface ExchangeResponse {
  status: 'signed_in' | 'verification_required';
  sessionToken?: string;
  expiresAt?: string;
  bindingToken?: string;
  wechatPhoneEnabled?: boolean;
  termsVersion?: string;
  privacyVersion?: string;
}

export interface SmsVerifyResponse {
  status: 'link_existing' | 'register';
  maskedPhone: string;
  termsVersion: string;
  privacyVersion: string;
}

function saveSession(token: string, expiresAt: string): void {
  write(StorageKeys.sessionToken, token);
  write(StorageKeys.sessionExpiresAt, expiresAt);
  clearBindingToken();
}

export function clearBindingToken(): void {
  remove(StorageKeys.bindingToken);
  remove(StorageKeys.bindingExpiresAt);
  remove(StorageKeys.bindingOptions);
}

/** 微信 code 换会话；未绑定手机号时返回 bindingToken 供后续流程。 */
export function exchangeWechatSession(): Promise<ExchangeResponse> {
  return new Promise<string>((resolve, reject) => {
    wx.login({
      success: (res) => resolve(res.code),
      fail: (err) => reject(new Error('微信登录失败：' + err.errMsg))
    });
  }).then((code) =>
    request<ExchangeResponse, { code: string }>({
      path: '/auth/wechat/exchange',
      method: 'POST',
      auth: 'none',
      data: { code }
    })
  );
}

export function isSessionValid(): boolean {
  const token = readString(StorageKeys.sessionToken);
  const expiresAt = readString(StorageKeys.sessionExpiresAt);
  if (!token || !expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  return !isNaN(ts) && Date.now() < ts - 30 * 1000;
}

/* ----------------------------- 短信绑定 ----------------------------- */

function persistBindingToken(token: string, expiresAt: string | undefined): void {
  write(StorageKeys.bindingToken, token);
  if (expiresAt) write(StorageKeys.bindingExpiresAt, expiresAt);
}

/** 以 wx.login 建立绑定会话（若本地已有 bindingToken 则直接复用）。 */
type BindingOptions = { wechatPhoneEnabled?: boolean; termsVersion?: string; privacyVersion?: string };
type BindingState = { status: 'signed_in' } | ({ status: 'verification_required' } & BindingOptions);

export function ensureBindingToken(): Promise<BindingState> {
  const existing = readString(StorageKeys.bindingToken);
  const expires = Date.parse(readString(StorageKeys.bindingExpiresAt) || '');
  const options = wx.getStorageSync(StorageKeys.bindingOptions) as BindingOptions | undefined;
  if (existing && expires > Date.now() + 10_000 && options && typeof options === 'object') {
    return Promise.resolve({ status: 'verification_required', ...options });
  }
  return exchangeWechatSession().then((res) => {
    if (res.status === 'signed_in' && res.sessionToken && res.expiresAt) {
      saveSession(res.sessionToken, res.expiresAt);
      return { status: 'signed_in' };
    }
    if (!res.bindingToken) throw new Error('服务未返回绑定令牌，请稍后重试');
    persistBindingToken(res.bindingToken, res.expiresAt);
    const options = {
      wechatPhoneEnabled: res.wechatPhoneEnabled === true,
      termsVersion: res.termsVersion || '',
      privacyVersion: res.privacyVersion || '',
    };
    write(StorageKeys.bindingOptions, options);
    return { status: 'verification_required', ...options };
  });
}

export async function registerWithWechatPhone(phoneCode: string, termsVersion: string, privacyVersion: string, reportId?: string) {
  const result = await request<SignedInEnvelope & { maskedPhone: string }>({
    path: '/auth/binding/wechat-phone',
    method: 'POST',
    auth: 'binding',
    data: { phoneCode, acceptTerms: true, termsVersion, privacyVersion, reportId },
  });
  saveSession(result.sessionToken, result.expiresAt);
  write(StorageKeys.boundPhoneMasked, result.maskedPhone);
  return result;
}

export function sendSmsCode(phone: string): Promise<number> {
  return request<{ retryAfterSeconds: number }, { phone: string }>({
      path: '/auth/binding/sms/send',
      method: 'POST',
      auth: 'binding',
      data: { phone }
    }).then((res) => res.retryAfterSeconds);
}

export function verifySmsCode(phone: string, code: string): Promise<SmsVerifyResponse> {
  return request<SmsVerifyResponse, { phone: string; code: string }>({
    path: '/auth/binding/sms/verify',
    method: 'POST',
    auth: 'binding',
    data: { phone, code }
  });
}

/**
 * 验证通过后的确认：register 必须显式同意条款（acceptTerms=true 且
 * 版本号回传）；link_existing 不强制勾选。
 */
export function confirmBinding(acceptTerms: boolean, verify: SmsVerifyResponse, reportId?: string): Promise<SignedInEnvelope> {
  const body: {
    acceptTerms?: boolean;
    termsVersion?: string;
    privacyVersion?: string;
    reportId?: string;
  } = { reportId };
  if (verify.status === 'register') {
    if (!acceptTerms) throw new Error('请先阅读并勾选同意服务条款与隐私政策');
    body.acceptTerms = true;
    body.termsVersion = verify.termsVersion;
    body.privacyVersion = verify.privacyVersion;
  }
  return request<SignedInEnvelope, typeof body>({
    path: '/auth/binding/sms/confirm',
    method: 'POST',
    auth: 'binding',
    data: body
  }).then((res) => {
    saveSession(res.sessionToken, res.expiresAt);
    write(StorageKeys.boundPhoneMasked, verify.maskedPhone);
    return res;
  });
}

/** 网页二维码配对：SMS verify 之后携带 pairToken 确认绑定。 */
export function confirmPairBinding(pairToken: string, maskedPhone: string): Promise<SignedInEnvelope> {
  return request<SignedInEnvelope, { pairToken: string }>({
    path: '/auth/binding/pair/confirm',
    method: 'POST',
    auth: 'binding',
    data: { pairToken }
  }).then((res) => {
    saveSession(res.sessionToken, res.expiresAt);
    write(StorageKeys.boundPhoneMasked, maskedPhone);
    return res;
  });
}

/* ------------------------------- 登出 ------------------------------- */

/**
 * 登出：服务端会话注销 + 清空本地私有缓存（报告、令牌、品牌评估
 * 回执等）+ 重建全新匿名访客。
 */
export function logout(): Promise<void> {
  const hadSession = !!readString(StorageKeys.sessionToken);
  const call = hadSession
    ? request<void, Record<string, never>>({
        path: '/auth/logout',
        method: 'POST',
        auth: 'session',
        data: {},
        allowMissingToken: true,
        timeoutMs: 8000
      }).catch(() => undefined)
    : Promise.resolve();
  return call.then(() => {
    clearPrivateCache();
    return resetVisitor();
  });
}

/* ------------------------- 登录后收尾：认领报告 ------------------------- */

/** 登录成功后把匿名期产生的检测认领到账号，失败静默（不影响主流程）。 */
export function claimPendingChecks(): Promise<string[]> {
  const ids = takePendingClaims();
  if (ids.length === 0) return Promise.resolve([]);
  return Promise.all(
    ids.map((id) =>
      claimQuickCheck(id).then(
        () => id,
        (error) => {
          if (!(error instanceof ApiError) || error.httpStatus !== 404) queuePendingClaim(id);
          return undefined;
        }
      )
    )
  ).then((results) => results.filter((id): id is string => typeof id === 'string'));
}
