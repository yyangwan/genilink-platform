import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceAuth } from '@/lib/auth/internal-service-auth';
import { runMarketingMaintenance } from '@/lib/marketing/maintenance';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = verifyInternalServiceAuth(request, 'MARKETING_CRON_SECRET');
  if (!auth.ok) return auth.response;
  if (process.env.MARKETING_JOBS_ENABLED === 'false') {
    return NextResponse.json({ error: { code: 'MARKETING_JOBS_DISABLED', message: '营销后台任务已关闭' } }, { status: 503 });
  }

  const result = await runMarketingMaintenance();
  console.log(JSON.stringify({
    event: 'marketing.maintenance.completed',
    ts: new Date().toISOString(),
    reconciled: result.reconciliation.decisions.length,
    unresolved: result.reconciliation.unresolved,
    aggregateGroups: result.aggregation.groups,
    notificationsDelivered: result.notifications.delivered,
    notificationsFailed: result.notifications.failed,
    cleanup: result.cleanup.deleted,
  }));
  return NextResponse.json({ data: result });
}
