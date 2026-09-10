/**
 * POST /api/internal/content-usage/reconcile（设计 §12.5）
 *
 * 每分钟由调度器调用（Bearer BILLING_CRON_SECRET）：
 * 对账超过 2 分钟未定案的预占记录；ContentOS 明确不存在 → 释放，
 * 已提交 → 提交，不可用 → 保留并输出 reconcile_required 事件。
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceAuth } from '@/lib/auth/internal-service-auth';
import { reconcilePendingUsage } from '@/lib/billing/usage-reservations';
import { lookupWorkflowByOperation } from '@/lib/content/contentos-internal-client';

export async function POST(req: NextRequest) {
  const auth = verifyInternalServiceAuth(req, 'BILLING_CRON_SECRET');
  if (!auth.ok) return auth.response;

  const decisions = await reconcilePendingUsage({ lookup: lookupWorkflowByOperation });

  for (const decision of decisions) {
    // 结构化事件（§15.2）；只记录 operationId 与动作。
    console.log(
      JSON.stringify({
        event:
          decision.action === 'kept' || decision.action === 'warn-timeout'
            ? 'content_usage.reconcile_required'
            : 'content_usage.reconciled',
        ts: new Date().toISOString(),
        operationId: decision.operationId,
        action: decision.action,
      }),
    );
  }

  return NextResponse.json({ data: { processed: decisions.length, decisions } });
}
