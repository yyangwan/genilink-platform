import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { resolveWorkspaceId } from '@/lib/auth/get-workspace';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { startProductWebsiteAnalysis } from '@/lib/product-website/start-analysis';

export const runtime = 'nodejs';

function responseWithSelection(body: unknown, status: number, workspaceId: string, projectId: string) {
  const response = NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  const options = {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 365 * 24 * 60 * 60,
    path: '/',
  };
  response.cookies.set('genilink-workspace', workspaceId, options);
  response.cookies.set('genilink-project', projectId, options);
  return response;
}

function analysisIdFrom(data: unknown): number | null {
  if (!data || typeof data !== 'object') return null;
  const value = (data as { analysisId?: unknown; id?: unknown }).analysisId
    ?? (data as { id?: unknown }).id;
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export async function POST(request: NextRequest) {
  if (process.env.ACQUISITION_ENABLED === 'false') {
    return NextResponse.json({ error: '获客诊断正在维护', code: 'ACQUISITION_DISABLED' }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }
  const userId = session.user.id;
  const intentId = request.cookies.get('genilink-intent')?.value;
  if (!intentId) {
    return NextResponse.json({ error: '诊断意图不存在', code: 'INTENT_MISSING' }, { status: 404 });
  }

  const intent = await prisma.acquisitionIntent.findUnique({
    where: { id: intentId },
    include: { session: true, project: true },
  });
  if (!intent || intent.expiresAt <= new Date()) {
    return NextResponse.json({ error: '诊断意图已过期', code: 'INTENT_EXPIRED' }, { status: 410 });
  }
  if (intent.userId && intent.userId !== userId) {
    return NextResponse.json({ error: '无权访问该诊断意图', code: 'INTENT_FORBIDDEN' }, { status: 403 });
  }
  if (intent.projectId && ['diagnosis_started', 'completed'].includes(intent.status)) {
    const project = intent.project;
    if (!project) return NextResponse.json({ error: '项目不存在', code: 'PROJECT_MISSING' }, { status: 409 });
    return responseWithSelection({ status: intent.status, analysisId: intent.analysisId, nextUrl: '/website-analysis?from=acquisition' }, 200, project.workspaceId, project.id);
  }
  if (intent.projectId && ['analysis_starting', 'analysis_unknown'].includes(intent.status)) {
    const project = intent.project;
    if (!project) return NextResponse.json({ error: '项目不存在', code: 'PROJECT_MISSING' }, { status: 409 });
    return responseWithSelection({ status: 'analysis_unknown', code: 'ANALYSIS_RECONCILING' }, 202, project.workspaceId, project.id);
  }

  const preferredWorkspaceId = request.cookies.get('genilink-workspace')?.value;
  const selectedWorkspaceId = await resolveWorkspaceId(userId, preferredWorkspaceId);
  const targetUrl = intent.targetUrl;
  if (!targetUrl) {
    return NextResponse.json({ error: '诊断网址不存在', code: 'TARGET_URL_MISSING' }, { status: 409 });
  }
  const hostname = new URL(targetUrl).hostname.replace(/^www\./, '');

  const selection = intent.projectId && intent.project
    ? { workspaceId: intent.project.workspaceId, projectId: intent.projectId }
    : await prisma.$transaction(async (tx) => {
    const claimed = await tx.acquisitionIntent.updateMany({
      where: {
        id: intent.id,
        status: 'pending',
        OR: [{ userId: null }, { userId }],
      },
      data: { userId, status: 'authenticated' },
    });
    if (claimed.count !== 1) return null;

    let workspaceId = selectedWorkspaceId;
    if (!workspaceId) {
      const workspace = await tx.workspace.create({ data: { name: `${hostname} 工作区` } });
      workspaceId = workspace.id;
      await tx.workspaceMember.create({
        data: { workspaceId, userId, role: 'owner' },
      });
    }

    let project = await tx.project.findFirst({
      where: { workspaceId, OR: [{ url: targetUrl }, { productUrl: targetUrl }] },
    });
    if (!project) {
      const sameName = await tx.project.findUnique({ where: { workspaceId_name: { workspaceId, name: hostname } } });
      project = await tx.project.create({
        data: {
          workspaceId,
          name: sameName ? `${hostname}-${intent.id.slice(-6)}` : hostname,
          url: targetUrl,
          productUrl: targetUrl,
          productName: hostname,
        },
      });
    }

    await tx.acquisitionSession.update({
      where: { id: intent.sessionId },
      data: { userId },
    });
    await tx.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true, onboardingStep: 'completed' },
    });
    await tx.acquisitionIntent.update({
      where: { id: intent.id },
      data: { projectId: project.id, status: 'project_ready' },
    });
    await tx.funnelEvent.upsert({
      where: { eventId: `intent:${intent.id}:project-ready` },
      create: {
        eventId: `intent:${intent.id}:project-ready`,
        sessionId: intent.sessionId,
        userId,
        workspaceId,
        projectId: project.id,
        eventName: 'project_created_from_intent',
        eventSource: 'server',
        source: intent.session.firstSource,
        medium: intent.session.firstMedium,
        campaign: intent.session.firstCampaign,
        occurredAt: new Date(),
      },
      update: {},
    });
    return { workspaceId, projectId: project.id };
    });

  if (!selection) {
    return NextResponse.json({ error: '诊断正在处理中，请刷新查看', code: 'INTENT_BUSY' }, { status: 409 });
  }

  const startClaim = await prisma.acquisitionIntent.updateMany({
    where: { id: intent.id, status: 'project_ready', projectId: selection.projectId },
    data: { status: 'analysis_starting', errorCode: null },
  });
  if (startClaim.count !== 1) {
    return responseWithSelection({ status: 'analysis_starting', code: 'ANALYSIS_RECONCILING' }, 202, selection.workspaceId, selection.projectId);
  }

  const guardRequest = new NextRequest(`${request.nextUrl.origin}/api/integration/product-website/analyze?projectId=${encodeURIComponent(selection.projectId)}`, {
    method: 'POST',
    headers: request.headers,
  });
  const guard = await resolveGuard(guardRequest);
  if (!guard.ok) return guard.response;

  const started = await startProductWebsiteAnalysis(guard.ctx, {
    requestedUrl: targetUrl,
    idempotencyKey: intent.idempotencyKey,
  });
  if ('response' in started) {
    const uncertain = started.response.status >= 502;
    await prisma.acquisitionIntent.update({
      where: { id: intent.id },
      data: {
        status: uncertain ? 'analysis_unknown' : 'failed',
        errorCode: uncertain ? 'UPSTREAM_RESULT_UNKNOWN' : `ANALYSIS_HTTP_${started.response.status}`,
      },
    });
    if (uncertain) {
      return responseWithSelection({ status: 'analysis_unknown', code: 'ANALYSIS_RECONCILING' }, 202, selection.workspaceId, selection.projectId);
    }
    return started.response;
  }

  const analysisId = analysisIdFrom(started.data);
  if (!analysisId) {
    await prisma.acquisitionIntent.update({
      where: { id: intent.id },
      data: { status: 'analysis_unknown', errorCode: 'UPSTREAM_MISSING_ANALYSIS_ID' },
    });
    return responseWithSelection({ status: 'analysis_unknown', code: 'ANALYSIS_RECONCILING' }, 202, selection.workspaceId, selection.projectId);
  }

  await prisma.$transaction([
    prisma.acquisitionIntent.update({
      where: { id: intent.id },
      data: { status: 'diagnosis_started', analysisId, errorCode: null },
    }),
    prisma.funnelEvent.upsert({
      where: { eventId: `analysis:${analysisId}:started` },
      create: {
        eventId: `analysis:${analysisId}:started`,
        sessionId: intent.sessionId,
        userId,
        workspaceId: selection.workspaceId,
        projectId: selection.projectId,
        eventName: 'diagnosis_started',
        eventSource: 'server',
        source: intent.session.firstSource,
        medium: intent.session.firstMedium,
        campaign: intent.session.firstCampaign,
        properties: { analysisId },
        occurredAt: new Date(),
      },
      update: {},
    }),
  ]);

  return responseWithSelection({ status: 'diagnosis_started', analysisId, nextUrl: '/website-analysis?from=acquisition' }, 200, selection.workspaceId, selection.projectId);
}
