import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { displayPhone, maskPhone, normalizePhone } from '@/lib/auth/phone';
import { findPhoneAccounts, lockPhoneAccount } from '@/lib/auth/phone-account';
import { consumeSmsCode, sendLoginCode, SmsRateLimitError } from '@/lib/auth/sms-verification';
import { consumeFixedWindowRateLimit } from '@/lib/marketing/rate-limit';
import { miniIpHash, QuickCheckError } from './quick-check-http';
import { code2Session } from './code2session';
import { findVisitor, reportAccess, reportEvent } from './quick-checks';
import { getWechatPhone } from './wechat-phone';

export const MINI_AGREEMENT_VERSION = '2026-11-13';
const SESSION_TTL = 30 * 86400_000;
const BINDING_TTL = 10 * 60_000;
const newToken = () => randomBytes(32).toString('base64url');
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

function tokenHash(token: unknown) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? hash(token) : null;
}

function bindingExpired() {
  return new QuickCheckError(401, 'BINDING_EXPIRED', '验证已过期，请重新开始');
}

function conflict() {
  return new QuickCheckError(409, 'IDENTITY_CONFLICT', '账号信息存在冲突，请验证原账号或联系智链支持');
}

export function requireBindingEnabled() {
  if (process.env.MINI_PROGRAM_BINDING_ENABLED !== 'true') {
    throw new QuickCheckError(503, 'BINDING_DISABLED', '小程序账号绑定暂未开放');
  }
}

function wechatPhoneEnabled() {
  return process.env.MINI_PROGRAM_WECHAT_PHONE_ENABLED === 'true';
}

function requireAgreement(input: Record<string, unknown>) {
  if (input.acceptTerms !== true || input.termsVersion !== MINI_AGREEMENT_VERSION || input.privacyVersion !== MINI_AGREEMENT_VERSION) {
    throw new QuickCheckError(400, 'AGREEMENT_REQUIRED', '请阅读并同意开户协议');
  }
}

function sessionHash(request: Request) {
  return tokenHash(request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]);
}

export async function requireMiniProgramSession(request: Request) {
  const token = sessionHash(request);
  if (!token) return null;
  const session = await prisma.miniProgramSession.findFirst({
    where: { tokenHash: token, expiresAt: { gt: new Date() } },
    select: { identity: { select: { userId: true, appId: true } } },
  });
  return session?.identity.appId === process.env.MINI_PROGRAM_APP_ID ? session?.identity ?? null : null;
}

export async function logoutMiniProgram(request: Request) {
  const token = sessionHash(request);
  if (token) await prisma.miniProgramSession.deleteMany({ where: { tokenHash: token } });
}

async function createSession(tx: Prisma.TransactionClient, identityId: string) {
  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL);
  await tx.miniProgramSession.create({ data: { tokenHash: hash(sessionToken), identityId, expiresAt } });
  return { status: 'signed_in' as const, sessionToken, expiresAt };
}

export async function exchangeWechat(request: Request, code: unknown) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(code)) {
    throw new QuickCheckError(400, 'INVALID_WECHAT_CODE', '微信登录凭证无效');
  }
  const appId = process.env.MINI_PROGRAM_APP_ID;
  const secret = process.env.MINI_PROGRAM_APP_SECRET;
  if (!appId || !secret) throw new QuickCheckError(503, 'WECHAT_UNAVAILABLE', '微信登录暂未配置');
  const rate = await consumeFixedWindowRateLimit(`mini:wechat:${miniIpHash(request)}`, 60, 300);
  if (!rate.allowed) throw new QuickCheckError(429, 'RATE_LIMITED', '操作过于频繁', rate.retryAfterSeconds);
  const { openId, unionId } = await code2Session(appId, secret, code);
  const existing = await prisma.miniProgramIdentity.findUnique({ where: { appId_openId: { appId, openId } } });
  if (existing) return prisma.$transaction((tx) => createSession(tx, existing.id));
  requireBindingEnabled();
  const bindingToken = newToken();
  const expiresAt = new Date(Date.now() + BINDING_TTL);
  await prisma.miniProgramBinding.create({ data: { tokenHash: hash(bindingToken), appId, openId, unionId, expiresAt } });
  return {
    status: 'verification_required' as const, bindingToken, expiresAt,
    wechatPhoneEnabled: wechatPhoneEnabled(), termsVersion: MINI_AGREEMENT_VERSION, privacyVersion: MINI_AGREEMENT_VERSION,
  };
}

async function getBinding(tx: Prisma.TransactionClient, request: Request) {
  requireBindingEnabled();
  const token = tokenHash(request.headers.get('x-binding-token'));
  if (!token) throw bindingExpired();
  const binding = await tx.miniProgramBinding.findFirst({
    where: { tokenHash: token, appId: process.env.MINI_PROGRAM_APP_ID, consumedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!binding || !process.env.MINI_PROGRAM_APP_ID) throw bindingExpired();
  return binding;
}

export async function sendBindingSms(request: Request, phone: unknown) {
  const binding = await getBinding(prisma, request);
  if (!normalizePhone(phone)) throw new QuickCheckError(400, 'INVALID_PHONE', '请输入正确的中国大陆手机号');
  try {
    return await sendLoginCode(phone, request.headers.get('x-real-ip') || 'unknown', binding.id);
  } catch (error) {
    if (error instanceof SmsRateLimitError) throw new QuickCheckError(429, 'SMS_RATE_LIMITED', '验证码发送过于频繁', error.retryAfterSeconds);
    throw error;
  }
}

export async function verifyBindingSms(request: Request, phone: unknown, code: unknown) {
  const result = await prisma.$transaction(async (tx) => {
    const binding = await getBinding(tx, request);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mini-binding:${binding.id}`}, 0))`;
    const current = await getBinding(tx, request);
    const proof = await consumeSmsCode(tx, phone, code, current.id);
    if (!proof) return null;
    const accounts = await findPhoneAccounts(tx, proof.phone);
    if (accounts.length > 1) return { status: 'conflict' } as const;
    await tx.miniProgramBinding.update({ where: { id: current.id }, data: { verifiedPhone: proof.phone, verifiedAt: new Date() } });
    return {
      status: accounts.length ? 'link_existing' as const : 'register' as const,
      maskedPhone: maskPhone(proof.phone),
      termsVersion: MINI_AGREEMENT_VERSION,
      privacyVersion: MINI_AGREEMENT_VERSION,
    };
  });
  if (!result) throw new QuickCheckError(401, 'INVALID_SMS_CODE', '验证码错误或已失效');
  if (result.status === 'conflict') throw conflict();
  return result;
}

export async function createWebPair(userId: string, officialProof?: string) {
  requireBindingEnabled();
  const pairToken = newToken();
  const expiresAt = new Date(Date.now() + 3 * 60_000);
  await prisma.$transaction(async (tx) => {
    if (officialProof) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { wechatOpenid: true } });
      if (!user?.wechatOpenid) throw new QuickCheckError(401, 'ACCOUNT_PROOF_REQUIRED', '请重新验证当前智链账号');
      const proof = await tx.wechatLoginSession.deleteMany({
        where: {
          token: officialProof, userId, openid: user.wechatOpenid, status: 'confirmed',
          createdAt: { gt: new Date(Date.now() - 5 * 60_000) }, expiresAt: { gt: new Date() },
        },
      });
      if (!proof.count) throw new QuickCheckError(401, 'ACCOUNT_PROOF_REQUIRED', '请重新验证当前智链账号');
    }
    await tx.miniProgramWebPair.create({ data: { tokenHash: hash(pairToken), userId, expiresAt } });
  });
  return { pairToken, expiresAt };
}

export async function finishBinding(request: Request, input: Record<string, unknown>, pair = false) {
  return completeBinding(request, input, pair);
}

export async function registerWithWechatPhone(request: Request, input: Record<string, unknown>) {
  if (!wechatPhoneEnabled()) {
    throw new QuickCheckError(503, 'WECHAT_PHONE_UNAVAILABLE', '微信手机号授权暂未开放，可改用短信验证');
  }
  requireAgreement(input);
  const code = input.phoneCode;
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(code)) {
    throw new QuickCheckError(400, 'INVALID_WECHAT_PHONE_CODE', '请重新授权微信手机号');
  }
  const binding = await getBinding(prisma, request);
  const rate = await consumeFixedWindowRateLimit(`mini:wechat-phone:${miniIpHash(request)}`, 30, 300);
  if (!rate.allowed) throw new QuickCheckError(429, 'RATE_LIMITED', '操作过于频繁', rate.retryAfterSeconds);
  const identityRate = await consumeFixedWindowRateLimit(
    `mini:wechat-phone-id:${hash(`${binding.appId}:${binding.openId}`)}`, 5, 300,
  );
  if (!identityRate.allowed) throw new QuickCheckError(429, 'RATE_LIMITED', '操作过于频繁', identityRate.retryAfterSeconds);
  const phone = await getWechatPhone(binding.appId, binding.openId, code);
  const session = await completeBinding(request, input, false, phone);
  return { ...session, maskedPhone: maskPhone(phone) };
}

async function completeBinding(request: Request, input: Record<string, unknown>, pair: boolean, wechatPhone?: string) {
  const visitor = await findVisitor(request);
  const report = visitor && typeof input.reportId === 'string' && input.reportId.length <= 120
    ? await reportAccess(input.reportId, visitor.id).catch((error: unknown) => {
      if (error instanceof QuickCheckError && error.status === 404) return null;
      throw error;
    }) : null;
  return prisma.$transaction(async (tx) => {
    const initial = await getBinding(tx, request);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mini-binding:${initial.id}`}, 0))`;
    const binding = await getBinding(tx, request);
    const phone = wechatPhone ?? binding.verifiedPhone;
    if (!phone || (!wechatPhone && (!binding.verifiedAt || Date.now() - binding.verifiedAt.getTime() > 5 * 60_000))) {
      throw new QuickCheckError(401, 'PHONE_NOT_VERIFIED', '请先验证手机号');
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mini-identity:${binding.appId}:${binding.openId}`}, 0))`;
    await lockPhoneAccount(tx, phone);
    const accounts = await findPhoneAccounts(tx, phone);
    if (accounts.length > 1) throw conflict();
    let user = accounts[0];
    const wx = await tx.miniProgramIdentity.findUnique({ where: { appId_openId: { appId: binding.appId, openId: binding.openId } } });
    const union = binding.unionId ? await tx.user.findUnique({ where: { wechatUnionid: binding.unionId } }) : null;
    if (wechatPhone && (user || union || wx)) {
      throw new QuickCheckError(409, 'EXISTING_ACCOUNT_VERIFICATION_REQUIRED', '请验证已有智链账号后继续');
    }
    if (pair) {
      const token = tokenHash(input.pairToken);
      const pairing = token ? await tx.miniProgramWebPair.findUnique({ where: { tokenHash: token }, include: { user: true } }) : null;
      if (!pairing || pairing.consumedAt || pairing.expiresAt <= new Date()) {
        throw new QuickCheckError(401, 'PAIR_EXPIRED', '电脑端配对码已失效，请重新生成');
      }
      if ((user && user.id !== pairing.userId) || (pairing.user.phone && normalizePhone(pairing.user.phone) !== phone)) throw conflict();
      const redeemed = await tx.miniProgramWebPair.updateMany({
        where: { tokenHash: pairing.tokenHash, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (!redeemed.count) throw conflict();
      if (pairing.user.phone) {
        user = pairing.user;
      } else {
        const updated = await tx.user.updateMany({ where: { id: pairing.userId, phone: null }, data: { phone } });
        if (!updated.count) throw conflict();
        user = { ...pairing.user, phone };
      }
    }
    if ((wx && wx.userId !== user?.id) || (union && union.id !== user?.id)) throw conflict();
    const newAccount = !user;
    if (!user) {
      requireAgreement(input);
      user = await tx.user.create({ data: { phone, name: `用户${displayPhone(phone).slice(-4)}` } });
      await tx.miniProgramAgreement.create({
        data: { userId: user.id, termsVersion: MINI_AGREEMENT_VERSION, privacyVersion: MINI_AGREEMENT_VERSION },
      });
    }
    const existing = await tx.miniProgramIdentity.findUnique({ where: { appId_userId: { appId: binding.appId, userId: user.id } } });
    if (existing && existing.openId !== binding.openId) throw conflict();
    const identity = existing ?? await tx.miniProgramIdentity.create({
      data: { appId: binding.appId, openId: binding.openId, unionId: binding.unionId, userId: user.id },
    });
    const consumed = await tx.miniProgramBinding.updateMany({
      where: { id: binding.id, consumedAt: null, expiresAt: { gt: new Date() } },
      data: { consumedAt: new Date() },
    });
    if (!consumed.count) throw bindingExpired();
    if (report && visitor) {
      await reportEvent(tx, report, visitor, newAccount ? 'mini_account_registered' : 'mini_account_linked', user.id);
    }
    return createSession(tx, identity.id);
  }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw conflict();
    throw error;
  });
}
