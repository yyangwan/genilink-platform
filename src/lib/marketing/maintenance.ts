import { Prisma } from '@/generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db';
import { issueVisibilityProjectJWT } from '@/lib/auth/service-jwt';
import { commitUsageOperation } from '@/lib/billing/usage-reservations';
import {
  startProductWebsiteAnalysis,
  websiteAnalysisOperationId,
} from '@/lib/product-website/start-analysis';
import type { ProductWebsiteAnalysis, ProductWebsiteAnalysisStatus } from '@/types/product-website';

const TERMINAL = new Set<ProductWebsiteAnalysisStatus>(['completed', 'partial', 'failed']);
const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

type IntentAnalysisContext = {
  id: string;
  sessionId: string;
  idempotencyKey: string;
  targetUrl: string | null;
  userId: string;
  projectId: string;
  session: {
    firstSource: string | null;
    firstMedium: string | null;
    firstCampaign: string | null;
  };
  project: { workspaceId: string };
};

export function terminalEventName(status: ProductWebsiteAnalysisStatus): 'diagnosis_completed' | 'diagnosis_failed' | null {
  if (status === 'completed' || status === 'partial') return 'diagnosis_completed';
  if (status === 'failed') return 'diagnosis_failed';
  return null;
}

async function fetchAnalysis(intent: {
  analysisId: number;
  userId: string;
  projectId: string;
  project: { workspaceId: string };
}) {
  const ctx = await buildAnalysisContext(intent);
  if (!ctx) return null;
  const response = await fetch(`${VISIBILITY_URL}/api/product-website/${intent.analysisId}`, {
    headers: ctx.headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  return response.json() as Promise<ProductWebsiteAnalysis>;
}

async function buildAnalysisContext(intent: {
  userId: string;
  projectId: string;
  project: { workspaceId: string };
}) {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: intent.userId, workspaceId: intent.project.workspaceId },
    select: { role: true },
  });
  if (!membership) return null;

  const token = await issueVisibilityProjectJWT({
    userId: intent.userId,
    workspaceId: intent.project.workspaceId,
    projectId: intent.projectId,
    role: membership.role,
  });
  return {
    session: { user: { id: intent.userId } },
    workspaceId: intent.project.workspaceId,
    projectId: intent.projectId,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    upstreamUrl: (path: string) => `${VISIBILITY_URL}${path}`,
  };
}

function analysisIdFrom(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const value = (data as { analysisId?: unknown; id?: unknown }).analysisId
    ?? (data as { id?: unknown }).id;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

async function bindRecoveredAnalysis(intent: IntentAnalysisContext, analysisId: number) {
  await commitUsageOperation(websiteAnalysisOperationId(intent.idempotencyKey));
  await prisma.$transaction([
    prisma.acquisitionIntent.updateMany({
      where: {
        id: intent.id,
        analysisId: null,
        status: { in: ['analysis_starting', 'analysis_unknown'] },
      },
      data: { status: 'diagnosis_started', analysisId, errorCode: null },
    }),
    prisma.funnelEvent.upsert({
      where: { eventId: `analysis:${analysisId}:started` },
      create: {
        eventId: `analysis:${analysisId}:started`,
        sessionId: intent.sessionId,
        userId: intent.userId,
        workspaceId: intent.project.workspaceId,
        projectId: intent.projectId,
        eventName: 'diagnosis_started',
        eventSource: 'server',
        source: intent.session.firstSource,
        medium: intent.session.firstMedium,
        campaign: intent.session.firstCampaign,
        properties: { analysisId, recovered: true },
        occurredAt: new Date(),
      },
      update: {},
    }),
  ]);
}

async function reconcileUnknownAnalysis(intent: IntentAnalysisContext): Promise<string> {
  const ctx = await buildAnalysisContext(intent);
  if (!ctx) return 'access_unavailable';

  let response: Response;
  try {
    response = await fetch(`${VISIBILITY_URL}/api/product-website/requests/lookup`, {
      headers: { ...ctx.headers, 'Idempotency-Key': intent.idempotencyKey },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return 'lookup_unavailable';
  }

  let data: unknown;
  if (response.status === 404) {
    const started = await startProductWebsiteAnalysis(ctx, {
      requestedUrl: intent.targetUrl,
      idempotencyKey: intent.idempotencyKey,
    });
    if ('response' in started) {
      if (started.response.status >= 500) return 'retry_unknown';
      await prisma.acquisitionIntent.updateMany({
        where: { id: intent.id, status: { in: ['analysis_starting', 'analysis_unknown'] } },
        data: { status: 'failed', errorCode: `ANALYSIS_HTTP_${started.response.status}` },
      });
      return 'retry_failed';
    }
    data = started.data;
  } else if (response.ok) {
    data = await response.json().catch(() => null);
  } else {
    return 'lookup_unavailable';
  }

  const analysisId = analysisIdFrom(data);
  if (!analysisId) return 'missing_analysis_id';
  await bindRecoveredAnalysis(intent, analysisId);
  return 'analysis_recovered';
}

export async function reconcileAcquisitionAnalyses() {
  const unknownIntents = await prisma.acquisitionIntent.findMany({
    where: {
      status: { in: ['analysis_starting', 'analysis_unknown'] },
      analysisId: null,
      userId: { not: null },
      projectId: { not: null },
      targetUrl: { not: null },
    },
    include: { session: true, project: { select: { workspaceId: true } } },
    orderBy: { updatedAt: 'asc' },
    take: 25,
  });

  const decisions: Array<{ intentId: string; action: string }> = [];
  for (const intent of unknownIntents) {
    if (!intent.userId || !intent.projectId || !intent.project) continue;
    const action = await reconcileUnknownAnalysis(intent as IntentAnalysisContext);
    decisions.push({ intentId: intent.id, action });
  }

  const intents = await prisma.acquisitionIntent.findMany({
    where: {
      status: 'diagnosis_started',
      analysisId: { not: null },
      userId: { not: null },
      projectId: { not: null },
    },
    include: { session: true, project: { select: { workspaceId: true } } },
    orderBy: { updatedAt: 'asc' },
    take: 50,
  });

  for (const intent of intents) {
    if (!intent.analysisId || !intent.userId || !intent.projectId || !intent.project) continue;
    let analysis: ProductWebsiteAnalysis | null = null;
    try {
      analysis = await fetchAnalysis({
        analysisId: intent.analysisId,
        userId: intent.userId,
        projectId: intent.projectId,
        project: intent.project,
      });
    } catch {
      decisions.push({ intentId: intent.id, action: 'lookup_unavailable' });
      continue;
    }
    if (!analysis || !TERMINAL.has(analysis.status)) {
      decisions.push({ intentId: intent.id, action: analysis ? 'running' : 'lookup_unavailable' });
      continue;
    }

    const eventName = terminalEventName(analysis.status);
    if (!eventName) continue;
    await prisma.$transaction([
      prisma.acquisitionIntent.updateMany({
        where: { id: intent.id, status: 'diagnosis_started' },
        data: {
          status: analysis.status === 'failed' ? 'failed' : 'completed',
          errorCode: analysis.status === 'failed' ? 'UPSTREAM_ANALYSIS_FAILED' : null,
          completedAt: new Date(),
        },
      }),
      prisma.funnelEvent.upsert({
        where: { eventId: `analysis:${intent.analysisId}:${analysis.status}` },
        create: {
          eventId: `analysis:${intent.analysisId}:${analysis.status}`,
          sessionId: intent.sessionId,
          userId: intent.userId,
          workspaceId: intent.project.workspaceId,
          projectId: intent.projectId,
          eventName,
          eventSource: 'server',
          source: intent.session.firstSource,
          medium: intent.session.firstMedium,
          campaign: intent.session.firstCampaign,
          properties: {
            analysisId: intent.analysisId,
            status: analysis.status,
            score: analysis.score_overall,
          },
          occurredAt: new Date(analysis.completed_at || analysis.updated_at || Date.now()),
        },
        update: {},
      }),
    ]);
    decisions.push({ intentId: intent.id, action: eventName });
  }

  const unresolved = await prisma.acquisitionIntent.count({
    where: { status: { in: ['analysis_starting', 'analysis_unknown'] } },
  });
  return { decisions, unresolved };
}

type DailyRow = {
  metricDate: Date;
  eventName: string;
  source: string;
  medium: string;
  campaign: string;
  eventCount: bigint;
  visitorCount: bigint;
};

export async function aggregatePreviousUtcDay(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<DailyRow[]>(Prisma.sql`
    SELECT
      DATE("occurredAt" AT TIME ZONE 'UTC') AS "metricDate",
      "eventName",
      COALESCE("source", '') AS "source",
      COALESCE("medium", '') AS "medium",
      COALESCE("campaign", '') AS "campaign",
      COUNT(*) AS "eventCount",
      COUNT(DISTINCT "sessionId") AS "visitorCount"
    FROM "FunnelEvent"
    WHERE "occurredAt" >= ${start} AND "occurredAt" < ${end}
    GROUP BY 1, 2, 3, 4, 5
  `);

  await prisma.$transaction(rows.map((row) => prisma.funnelDailyMetric.upsert({
    where: {
      metricDate_eventName_source_medium_campaign: {
        metricDate: row.metricDate,
        eventName: row.eventName,
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
      },
    },
    create: {
      metricDate: row.metricDate,
      eventName: row.eventName,
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      eventCount: Number(row.eventCount),
      visitorCount: Number(row.visitorCount),
    },
    update: {
      eventCount: Number(row.eventCount),
      visitorCount: Number(row.visitorCount),
    },
  })));
  return { start, end, groups: rows.length };
}

export async function deliverLeadNotifications(now = new Date()) {
  const webhookUrl = process.env.SALES_LEAD_WEBHOOK_URL;
  if (!webhookUrl) return { delivered: 0, failed: 0 };
  const candidates = await prisma.leadNotificationDelivery.findMany({
    where: {
      status: { in: ['pending', 'retry'] },
      nextRetryAt: { lte: now },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    include: { lead: { select: { id: true, kind: true, companyName: true, score: true, grade: true, contactWithdrawnAt: true } } },
    orderBy: { nextRetryAt: 'asc' },
    take: 20,
  });
  let delivered = 0;
  let failed = 0;
  for (const item of candidates) {
    if (item.lead.contactWithdrawnAt) {
      await prisma.leadNotificationDelivery.update({
        where: { id: item.id },
        data: { status: 'canceled', lockedBy: null, lockedUntil: null, lastError: 'CONTACT_WITHDRAWN' },
      });
      continue;
    }
    const lease = randomUUID();
    const claimed = await prisma.leadNotificationDelivery.updateMany({
      where: { id: item.id, status: { in: ['pending', 'retry'] }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { lockedBy: lease, lockedUntil: new Date(now.getTime() + 60_000), attempts: { increment: 1 } },
    });
    if (claimed.count !== 1) continue;
    const currentLead = await prisma.marketingLead.findUnique({
      where: { id: item.lead.id },
      select: { contactWithdrawnAt: true },
    });
    if (!currentLead || currentLead.contactWithdrawnAt) {
      await prisma.leadNotificationDelivery.update({
        where: { id: item.id },
        data: { status: 'canceled', lockedBy: null, lockedUntil: null, lastError: 'CONTACT_WITHDRAWN' },
      });
      continue;
    }
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: item.lead.id,
          kind: item.lead.kind,
          companyName: item.lead.companyName,
          score: item.lead.score,
          grade: item.lead.grade,
          detailUrl: `/ops/leads/${item.lead.id}`,
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      await prisma.leadNotificationDelivery.update({
        where: { id: item.id },
        data: { status: 'delivered', deliveredAt: new Date(), lockedBy: null, lockedUntil: null, lastError: null },
      });
      delivered += 1;
    } catch (error) {
      const attempts = item.attempts + 1;
      await prisma.leadNotificationDelivery.update({
        where: { id: item.id },
        data: {
          status: attempts >= 5 ? 'failed' : 'retry',
          nextRetryAt: new Date(now.getTime() + Math.min(60, 2 ** attempts) * 60_000),
          lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500),
          lockedBy: null,
          lockedUntil: null,
        },
      });
      failed += 1;
    }
  }
  return { delivered, failed };
}

function eventRetentionDays() {
  const value = Number(process.env.MARKETING_EVENT_RETENTION_DAYS || 90);
  return Number.isInteger(value) && value >= 30 && value <= 730 ? value : 90;
}

export async function cleanupMarketingData(now = new Date()) {
  const eventCutoff = new Date(now.getTime() - eventRetentionDays() * 24 * 60 * 60 * 1000);
  const [intents, events, rateLimits] = await prisma.$transaction([
    prisma.acquisitionIntent.deleteMany({
      where: { expiresAt: { lt: now }, status: { in: ['pending', 'completed', 'failed'] } },
    }),
    prisma.funnelEvent.deleteMany({ where: { occurredAt: { lt: eventCutoff } } }),
    prisma.credentialRateLimitBucket.deleteMany({
      where: {
        expiresAt: { lt: now },
        OR: [{ key: { startsWith: 'acquisition:' } }, { key: { startsWith: 'lead:' } }],
      },
    }),
  ]);
  const sessions = await prisma.acquisitionSession.deleteMany({
    where: {
      expiresAt: { lt: now },
      intents: { none: {} },
      leads: { none: {} },
      checkoutSessions: { none: {} },
      paymentOrders: { none: {} },
    },
  });
  return {
    eventCutoff,
    deleted: {
      intents: intents.count,
      events: events.count,
      rateLimits: rateLimits.count,
      sessions: sessions.count,
    },
  };
}

export async function runMarketingMaintenance() {
  const [reconciliation, aggregation, notifications, cleanup] = await Promise.all([
    reconcileAcquisitionAnalyses(),
    aggregatePreviousUtcDay(),
    deliverLeadNotifications(),
    cleanupMarketingData(),
  ]);
  return { reconciliation, aggregation, notifications, cleanup };
}
