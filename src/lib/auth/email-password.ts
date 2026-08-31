import bcrypt from 'bcryptjs';
import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/db';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const DUMMY_PASSWORD_HASH = '$2b$12$eBJgPFMlD9S6HUj4mHaZ3.qAbFmGyr1/opXDU00UU3gXROCKJQRLq';
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_ATTEMPT_LIMIT = 10;
const IP_ATTEMPT_LIMIT = 30;

function attemptSecret(): string {
  const value = process.env.AUTH_SECRET || process.env.SMS_CODE_SECRET;
  if (!value) throw new Error('AUTH_SECRET or SMS_CODE_SECRET is required');
  return value;
}

function attemptDigest(value: string): string {
  return createHmac('sha256', attemptSecret()).update(value).digest('hex');
}

async function consumeRateLimitBucket(key: string, expiresAt: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "CredentialRateLimitBucket" ("key", "count", "expiresAt", "updatedAt")
    VALUES (${key}, 1, ${expiresAt}, NOW())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "CredentialRateLimitBucket"."expiresAt" <= NOW() THEN 1
        ELSE "CredentialRateLimitBucket"."count" + 1
      END,
      "expiresAt" = CASE
        WHEN "CredentialRateLimitBucket"."expiresAt" <= NOW() THEN EXCLUDED."expiresAt"
        ELSE "CredentialRateLimitBucket"."expiresAt"
      END,
      "updatedAt" = NOW()
    RETURNING "count"
  `;
  return Number(rows[0]?.count ?? Number.MAX_SAFE_INTEGER);
}

async function cleanupExpiredRateLimitBuckets() {
  await prisma.$executeRaw`
    WITH expired AS (
      SELECT "key"
      FROM "CredentialRateLimitBucket"
      WHERE "expiresAt" <= NOW()
      ORDER BY "expiresAt"
      LIMIT 1000
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "CredentialRateLimitBucket" AS bucket
    USING expired
    WHERE bucket."key" = expired."key"
      AND bucket."expiresAt" <= NOW()
  `;
}

async function loginIsRateLimited(email: string, rawIp: string) {
  const expiresAt = new Date(Date.now() + ATTEMPT_WINDOW_MS);
  const ipCount = await consumeRateLimitBucket(
    attemptDigest(`credential-ip:${rawIp || 'unknown'}`),
    expiresAt,
  );
  if (ipCount === 1) await cleanupExpiredRateLimitBuckets();
  if (ipCount > IP_ATTEMPT_LIMIT) return true;

  const accountCount = await consumeRateLimitBucket(
    attemptDigest(`credential-email:${email}`),
    expiresAt,
  );
  return accountCount > ACCOUNT_ATTEMPT_LIMIT;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function validatePassword(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length < MIN_PASSWORD_LENGTH || Buffer.byteLength(value, 'utf8') > MAX_PASSWORD_BYTES) {
    return null;
  }
  return value;
}

export async function verifyEmailPassword(rawEmail: unknown, rawPassword: unknown, rawIp = 'unknown') {
  const email = normalizeEmail(rawEmail);
  const password = validatePassword(rawPassword);
  if (!email || !password) return null;

  if (await loginIsRateLimited(email, rawIp)) return null;

  const user = await prisma.user.findUnique({
    where: { loginEmail: email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  const matches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user?.passwordHash || !matches) return null;

  return { id: user.id, email: user.email, name: user.name };
}
