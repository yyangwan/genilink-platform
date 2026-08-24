import 'server-only';

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db';
import { displayPhone, normalizePhone } from '@/lib/auth/phone';
import { deliverSmsCode, getSmsProvider } from '@/lib/auth/sms-providers';

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

function codeDigest(phone: string, code: string): string {
  return digest(`sms-code:${phone}:${code}`);
}

function ipDigest(ip: string): string {
  return digest(`sms-ip:${ip}`);
}

export async function sendLoginCode(rawPhone: unknown, rawIp: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new TypeError('INVALID_PHONE');

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const hashedIp = ipDigest(rawIp || 'unknown');
  const [latest, phoneCount, ipCount] = await Promise.all([
    prisma.smsVerificationCode.findFirst({
      where: { phone, purpose: 'login' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.smsVerificationCode.count({
      where: { phone, purpose: 'login', createdAt: { gte: hourAgo } },
    }),
    prisma.smsVerificationCode.count({
      where: { ipHash: hashedIp, createdAt: { gte: hourAgo } },
    }),
  ]);

  if (latest) {
    const remaining = RESEND_COOLDOWN_MS - (now.getTime() - latest.createdAt.getTime());
    if (remaining > 0) throw new SmsRateLimitError(Math.ceil(remaining / 1000));
  }
  if (phoneCount >= PHONE_HOURLY_LIMIT || ipCount >= IP_HOURLY_LIMIT) {
    throw new SmsRateLimitError(60 * 60);
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const provider = getSmsProvider();
  const challenge = await prisma.smsVerificationCode.create({
    data: {
      phone,
      codeHash: codeDigest(phone, code),
      purpose: 'login',
      provider,
      ipHash: hashedIp,
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    },
    select: { id: true },
  });

  try {
    await deliverSmsCode(provider, phone, code);
  } catch (error) {
    await prisma.smsVerificationCode.delete({ where: { id: challenge.id } }).catch(() => undefined);
    throw error;
  }

  return { expiresInSeconds: CODE_TTL_MS / 1000, retryAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
}

export async function verifyLoginCode(rawPhone: unknown, rawCode: unknown) {
  const phone = normalizePhone(rawPhone);
  const code = typeof rawCode === 'string' ? rawCode.trim() : '';
  if (!phone || !/^\d{6}$/.test(code)) return null;

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const challenge = await tx.smsVerificationCode.findFirst({
      where: {
        phone,
        purpose: 'login',
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: MAX_VERIFY_ATTEMPTS },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) return null;

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const actual = Buffer.from(codeDigest(phone, code), 'hex');
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
    if (consumed.count !== 1) return null;

    let user = await tx.user.findFirst({
      where: { phone: { in: [phone, displayPhone(phone)] } },
    });
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
