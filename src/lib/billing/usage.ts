import { NextResponse } from 'next/server';
import type { InputJsonValue } from '@prisma/client/runtime/client';
import { prisma } from '@/lib/db';
import { getWorkspaceBillingAccess } from '@/lib/billing/access';
import type { TierLimitKey } from '@/lib/billing/tiers';

export type UsageFeature =
  | 'website_analysis'
  | 'visibility_audit'
  | 'compare_run'
  | 'pdf_export'
  | 'content_generation'
  | 'content_optimization'
  | 'content_score'
  | 'calendar_item';

const FEATURE_LIMIT_KEYS: Record<UsageFeature, TierLimitKey> = {
  website_analysis: 'websiteAnalysesPerMonth',
  visibility_audit: 'visibilityAuditsPerMonth',
  compare_run: 'compareRunsPerMonth',
  pdf_export: 'pdfExportsPerMonth',
  content_generation: 'contentGenerationsPerMonth',
  content_optimization: 'contentOptimizationsPerMonth',
  content_score: 'contentScoresPerMonth',
  calendar_item: 'calendarItemsPerMonth',
};

const FEATURE_LABELS: Record<UsageFeature, string> = {
  website_analysis: '网站分析',
  visibility_audit: '可见性审计',
  compare_run: '竞品/审计对比',
  pdf_export: 'PDF 报告导出',
  content_generation: '内容生成',
  content_optimization: '内容优化',
  content_score: '内容评分',
  calendar_item: '内容日历排期',
};

export class PlanLimitError extends Error {
  statusCode = 402;

  constructor(
    public readonly feature: UsageFeature,
    public readonly used: number,
    public readonly limit: number,
  ) {
    super(`${FEATURE_LABELS[feature]} monthly quota exceeded`);
    this.name = 'PlanLimitError';
  }
}

export function getUsagePeriodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function planLimitResponse(error: PlanLimitError): NextResponse {
  return NextResponse.json(
    {
      error: 'PLAN_LIMIT_EXCEEDED',
      feature: error.feature,
      label: FEATURE_LABELS[error.feature],
      used: error.used,
      limit: error.limit,
    },
    { status: error.statusCode },
  );
}

export async function requireMonthlyUsageQuota(
  userId: string,
  workspaceId: string,
  feature: UsageFeature,
  quantity = 1,
  metadata?: InputJsonValue,
): Promise<void> {
  if (process.env.BILLING_DISABLED === 'true') return;

  await assertMonthlyUsageQuota(userId, workspaceId, feature, quantity);
  await recordMonthlyUsage(userId, workspaceId, feature, quantity, metadata);
}

export async function assertMonthlyUsageQuota(
  userId: string,
  workspaceId: string,
  feature: UsageFeature,
  quantity = 1,
): Promise<void> {
  if (process.env.BILLING_DISABLED === 'true') return;

  const access = await getWorkspaceBillingAccess(userId, workspaceId);
  const limit = access.limits[FEATURE_LIMIT_KEYS[feature]];
  const periodStart = getUsagePeriodStart();
  const aggregate = await prisma.usageEvent.aggregate({
    where: { workspaceId, feature, periodStart },
    _sum: { quantity: true },
  });

  const used = aggregate._sum.quantity ?? 0;
  if (used + quantity > limit) {
    throw new PlanLimitError(feature, used, limit);
  }
}

export async function recordMonthlyUsage(
  userId: string,
  workspaceId: string,
  feature: UsageFeature,
  quantity = 1,
  metadata?: InputJsonValue,
): Promise<void> {
  if (process.env.BILLING_DISABLED === 'true') return;

  await prisma.usageEvent.create({
    data: {
      workspaceId,
      userId,
      feature,
      quantity,
      periodStart: getUsagePeriodStart(),
      metadata: metadata ?? undefined,
    },
  });
}
