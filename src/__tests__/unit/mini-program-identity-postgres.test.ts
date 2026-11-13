import { randomInt, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { sendLoginCode, verifyLoginCode } from '@/lib/auth/sms-verification';
import { deliverSmsCode } from '@/lib/auth/sms-providers';
import {
  exchangeWechat, finishBinding, logoutMiniProgram, registerWithWechatPhone, requireMiniProgramSession, sendBindingSms, verifyBindingSms,
} from '@/lib/mini-program/identity';

vi.unmock('@/lib/db');
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/sms-providers', () => ({ deliverSmsCode: vi.fn(async () => undefined), getSmsProvider: () => 'aliyun' }));

describe.skipIf(process.env.MINI_PROGRAM_TEST_POSTGRES !== 'true')('mini-program identity with PostgreSQL', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['new phone', 'existing phone', 'different app', 'expired code'])('uses server-verified WeChat phone proof for %s', async (scenario) => {
    const appId = `phone-test-${randomUUID()}`;
    const openId = randomUUID();
    const national = `139${String(randomInt(100_000_000)).padStart(8, '0')}`;
    const phone = `+86${national}`;
    vi.stubEnv('AUTH_SECRET', 'test-only');
    vi.stubEnv('MINI_PROGRAM_APP_ID', appId);
    vi.stubEnv('MINI_PROGRAM_APP_SECRET', 'test-only');
    vi.stubEnv('MINI_PROGRAM_BINDING_ENABLED', 'true');
    vi.stubEnv('MINI_PROGRAM_WECHAT_PHONE_ENABLED', 'true');
    const provider = vi.fn(async (input: string | URL, options?: RequestInit) => {
      const endpoint = new URL(input);
      if (endpoint.pathname === '/sns/jscode2session') return Response.json({ openid: openId });
      if (endpoint.pathname === '/cgi-bin/stable_token') {
        expect(JSON.parse(String(options?.body))).toMatchObject({ appid: appId, force_refresh: false });
        return Response.json({ access_token: 'test-service-token', expires_in: 7200 });
      }
      expect(endpoint.pathname).toBe('/wxa/business/getuserphonenumber');
      expect(JSON.parse(String(options?.body))).toEqual({ code: 'phone-authorization', openid: openId });
      if (scenario === 'expired code') return Response.json({ errcode: 40029 });
      return Response.json({
        errcode: 0,
        phone_info: { countryCode: '86', purePhoneNumber: national, watermark: { appid: scenario === 'different app' ? 'other' : appId } },
      });
    });
    vi.stubGlobal('fetch', provider);
    const existing = scenario === 'existing phone'
      ? await prisma.user.create({ data: { phone: national, name: 'Existing account' } }) : null;
    try {
      const flow = await exchangeWechat(new Request('http://localhost', { headers: { 'x-real-ip': randomUUID() } }), 'login-authorization');
      if (flow.status !== 'verification_required') throw new Error('Expected first-time verification');
      expect(flow.wechatPhoneEnabled).toBe(true);
      const request = new Request('http://localhost', {
        headers: { 'x-binding-token': flow.bindingToken, 'x-real-ip': randomUUID() },
      });
      const input = { phoneCode: 'phone-authorization', acceptTerms: true, termsVersion: flow.termsVersion, privacyVersion: flow.privacyVersion };
      await expect(registerWithWechatPhone(request, { ...input, acceptTerms: false })).rejects.toMatchObject({ code: 'AGREEMENT_REQUIRED' });
      expect(provider).toHaveBeenCalledTimes(1);
      if (scenario === 'new phone') {
        const session = await registerWithWechatPhone(request, input);
        expect(session.maskedPhone).toBe(`${national.slice(0, 3)}****${national.slice(-4)}`);
        const identity = await requireMiniProgramSession(new Request('http://localhost', { headers: { authorization: `Bearer ${session.sessionToken}` } }));
        const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
        expect(identity?.userId).toBe(user.id);
        await expect(prisma.miniProgramAgreement.count({ where: { userId: user.id } })).resolves.toBe(1);
        await expect(registerWithWechatPhone(request, input)).rejects.toMatchObject({ code: 'BINDING_EXPIRED' });
      } else {
        await expect(registerWithWechatPhone(request, input)).rejects.toMatchObject({
          code: existing ? 'EXISTING_ACCOUNT_VERIFICATION_REQUIRED'
            : scenario === 'expired code' ? 'WECHAT_PHONE_CODE_EXPIRED' : 'WECHAT_PHONE_UNAVAILABLE',
        });
        await expect(prisma.user.findUnique({ where: { phone } })).resolves.toBeNull();
        await expect(prisma.miniProgramIdentity.count({ where: { appId, openId } })).resolves.toBe(0);
      }
      expect(deliverSmsCode).not.toHaveBeenCalled();
    } finally {
      await prisma.miniProgramBinding.deleteMany({ where: { appId } });
      await prisma.user.deleteMany({ where: { phone: { in: [phone, national] } } });
    }
  });

  it('scopes SMS proof, creates one account on concurrent confirmations and revokes the session', async () => {
    const appId = 'mini-program-test';
    const openId = randomUUID();
    const phone = `+86139${String(randomInt(100_000_000)).padStart(8, '0')}`;
    vi.stubEnv('AUTH_SECRET', 'test-only');
    vi.stubEnv('MINI_PROGRAM_APP_ID', appId);
    vi.stubEnv('MINI_PROGRAM_APP_SECRET', 'test-only');
    vi.stubEnv('MINI_PROGRAM_BINDING_ENABLED', 'true');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ openid: openId, session_key: 'discard-me' })));
    const request = new Request('http://localhost', { headers: { 'x-real-ip': randomUUID() } });
    const flow = await exchangeWechat(request, 'valid-code');
    if (flow.status !== 'verification_required') throw new Error('Expected first-time verification');
    const binding = new Request('http://localhost', {
      headers: { 'x-binding-token': flow.bindingToken, 'x-real-ip': randomUUID() },
    });
    try {
      await sendLoginCode(phone, randomUUID());
      const webCode = vi.mocked(deliverSmsCode).mock.calls.at(-1)![2];
      await expect(verifyBindingSms(binding, phone, webCode)).rejects.toMatchObject({ code: 'INVALID_SMS_CODE' });
      await prisma.smsVerificationCode.updateMany({
        where: { phone }, data: { createdAt: new Date(Date.now() - 61_000) },
      });
      await sendBindingSms(binding, phone);
      const bindingCode = vi.mocked(deliverSmsCode).mock.calls.at(-1)![2];
      expect(bindingCode).toMatch(/^\d{6}$/);
      await expect(verifyBindingSms(binding, phone, bindingCode)).resolves.toMatchObject({ status: 'register' });
      await expect(finishBinding(binding, {})).rejects.toMatchObject({ code: 'AGREEMENT_REQUIRED' });

      const consent = { acceptTerms: true, termsVersion: '2026-11-13', privacyVersion: '2026-11-13' };
      const attempts = await Promise.allSettled([finishBinding(binding, consent), finishBinding(binding, consent)]);
      const success = attempts.filter((attempt) => attempt.status === 'fulfilled');
      expect(success).toHaveLength(1);
      const user = await prisma.user.findUniqueOrThrow({ where: { phone } });
      await expect(prisma.miniProgramAgreement.count({ where: { userId: user.id } })).resolves.toBe(1);
      await expect(verifyLoginCode(phone, webCode)).resolves.toMatchObject({ id: user.id });

      const session = new Request('http://localhost', { headers: { Authorization: `Bearer ${success[0].value.sessionToken}` } });
      await expect(requireMiniProgramSession(session)).resolves.toMatchObject({ userId: user.id });
      await logoutMiniProgram(session);
      await expect(requireMiniProgramSession(session)).resolves.toBeNull();
      await expect(exchangeWechat(request, 'new-code')).resolves.toMatchObject({ status: 'signed_in' });
    } finally {
      await prisma.smsVerificationCode.deleteMany({ where: { phone } });
      await prisma.miniProgramBinding.deleteMany({ where: { appId, openId } });
      await prisma.user.deleteMany({ where: { phone } });
    }
  });
});
