import 'server-only';

import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';

export async function consumeFixedWindowRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const expiresAt = new Date(Date.now() + windowSeconds * 1000);
  const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>(Prisma.sql`
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
    RETURNING "count", "expiresAt"
  `);
  const bucket = rows[0];
  return {
    allowed: Boolean(bucket && bucket.count <= limit),
    retryAfterSeconds: bucket
      ? Math.max(1, Math.ceil((bucket.expiresAt.getTime() - Date.now()) / 1000))
      : windowSeconds,
  };
}
