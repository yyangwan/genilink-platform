import 'server-only';

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { displayPhone, normalizePhone } from '@/lib/auth/phone';
import { deliverSmsCode, getSmsProvider } from '@/lib/auth/sms-providers';
import type { Prisma } from '@/generated/prisma/client';
import { findPhoneAccounts, lockPhoneAccount } from './phone-account';

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const PHONE_HOURLY_LIMIT = 5;
const IP_HOURLY_LIMIT = 20;
const MAX_VERIFY_ATTEMPTS = 5;

export class SmsRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('SMS_RATE_LIMITED');
  }
}

function secret(): string {
  const value = process.env.SMS_CODE_SECRET || process.env.AUTH_SECRET;
  if (!value) throw new Error('SMS_CODE_SECRET or AUTH_SECRET is required');
  return value;
}

function digest(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('hex');
}

function codeDigest(phone: string, code: string, bindingId?: string): string {
  return digest(bindingId ? `sms-mini:${bindingId}:${phone}:${code}` : `sms-code:${phone}:${code}`);
}

function ipDigest(ip: string): string {
  return digest(`sms-ip:${ip}`);
}

export async function sendLoginCode(rawPhone: unknown, rawIp: string, bindingId?: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new TypeError('INVALID_PHONE');

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const hashedIp = ipDigest(rawIp || 'unknown');
  const provider = getSmsProvider();
  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const challenge = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-send-ip:${hashedIp}`}, 0))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-send-phone:${phone}`}, 0))`;
    const [latest, phoneCount, ipCount] = await Promise.all([
      tx.smsVerificationCode.findFirst({
        where: { phone },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      tx.smsVerificationCode.count({ where: { phone, createdAt: { gte: hourAgo } } }),
      tx.smsVerificationCode.count({ where: { ipHash: hashedIp, createdAt: { gte: hourAgo } } }),
    ]);

    if (latest) {
      const remaining = RESEND_COOLDOWN_MS - (now.getTime() - latest.createdAt.getTime());
      if (remaining > 0) throw new SmsRateLimitError(Math.ceil(remaining / 1000));
    }
    if (phoneCount >= PHONE_HOURLY_LIMIT || ipCount >= IP_HOURLY_LIMIT) {
      throw new SmsRateLimitError(60 * 60);
    }

    return tx.smsVerificationCode.create({
      data: {
        phone,
        codeHash: codeDigest(phone, code, bindingId),
        purpose: bindingId ? 'mini_program_binding' : 'login',
        miniProgramBindingId: bindingId,
        provider,
        ipHash: hashedIp,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
      select: { id: true },
    });
  });

  try {
    await deliverSmsCode(provider, phone, code);
  } catch (error) {
    await prisma.smsVerificationCode.delete({ where: { id: challenge.id } }).catch(() => undefined);
    throw error;
  }

  return { expiresInSeconds: CODE_TTL_MS / 1000, retryAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
}

export async function consumeSmsCode(tx: Prisma.TransactionClient, rawPhone: unknown, rawCode: unknown, bindingId?: string) {
  const phone = normalizePhone(rawPhone);
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!phone || !/^\d{6}$/.test(code)) return null;

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sms-verify:${phone}`}, 0))`;
  const now = new Date();
  const challenge = await tx.smsVerificationCode.findFirst({
    where: {
      phone,
      purpose: bindingId ? 'mini_program_binding' : 'login',
      miniProgramBindingId: bindingId ?? null,
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= MAX_VERIFY_ATTEMPTS) return null;

  const expected = Buffer.from(challenge.codeHash, 'hex');
  const actual = Buffer.from(codeDigest(phone, code, bindingId), 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await tx.smsVerificationCode.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return null;
  }

  const consumed = await tx.smsVerificationCode.updateMany({
    where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  return consumed.count === 1 ? { id: challenge.id, phone } : null;
}

export async function verifyLoginCode(rawPhone: unknown, rawCode: unknown, expectedUserId?: string) {
  return prisma.$transaction(async (tx) => {
    const challenge = await consumeSmsCode(tx, rawPhone, rawCode);
    if (!challenge) return null;
    const { phone } = challenge;
    await lockPhoneAccount(tx, phone);
    const accounts = await findPhoneAccounts(tx, phone);
    if (accounts.length > 1 || (expectedUserId && accounts[0]?.id !== expectedUserId)) return null;
    let user = accounts[0];
    if (!user) {
      user = await tx.user.create({
        data: {
          phone,
          name: `用户${displayPhone(phone).slice(-4)}`,
          onboardingCompleted: false,
        },
      });
    }
    await tx.smsVerificationCode.update({
      where: { id: challenge.id },
      data: { userId: user.id },
    });
    return user;
  });
}
