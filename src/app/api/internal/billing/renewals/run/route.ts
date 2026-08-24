import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { runRenewalBatch } from '@/lib/billing/renewals/service';
import { closeExpiredSessionOrders } from '@/lib/billing/payments/orchestrator';
import { runBillingNotificationBatch } from '@/lib/billing/notifications/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RENEWAL_BATCH_SIZE = 50;

function timingSafeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

/**
 * Internal renewal cron endpoint (spec §8.7). Server-side scheduler only —
 * call every 15 minutes with `Authorization: Bearer ${BILLING_CRON_SECRET}`.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.BILLING_CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'BILLING_CRON_SECRET 未配置', details: {} } },
      { status: 503 },
    );
  }

  const authorization = req.headers.get('authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || !timingSafeEqual(token, secret)) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: '未授权', details: {} } },
      { status: 401 },
    );
  }

  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
  const result = await runRenewalBatch(workerId, RENEWAL_BATCH_SIZE);
  // Retryable channel-close sweep for expired sessions runs on every cron
  // pass until no stale QR/redirect remains payable (remediation §4.1).
  const channelClose = await closeExpiredSessionOrders().catch(() => ({
    closed: 0,
    reconciled: 0,
    failed: 0,
  }));
  const notifications = await runBillingNotificationBatch(RENEWAL_BATCH_SIZE).catch((error) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
  return NextResponse.json({ workerId, ...result, channelClose, notifications });
}
