import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { hasProjectCapacity } from '@/lib/billing/access';
import { prisma } from '@/lib/db';
import { miniJson, QuickCheckError, quickCheckRoute, readMiniBody } from '@/lib/mini-program/quick-check-http';
import { reportAccess, reportEvent } from '@/lib/mini-program/quick-checks';
import { startProductWebsiteAnalysis } from '@/lib/product-website/start-analysis';
import { resolveGuard } from '@/lib/proxy/route-guard';

const selection = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), workspaceId: z.string().min(1).max(120), projectId: z.string().min(1).max(120) }),
  z.object({ mode: z.literal('create'), workspaceId: z.string().min(1).max(120) }),
  z.object({ mode: z.literal('personal') }),
]);

export function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return quickCheckRoute(async () => {
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) throw new QuickCheckError(403, 'INVALID_ORIGIN', '请从智链工作台打开');
    const session = await auth();
    if (!session?.user?.id) throw new QuickCheckError(401, 'UNAUTHORIZED', '请先登录智链');
    const userId = session.user.id;
    const { id } = await params;
    const report = await reportAccess(id, undefined, userId);
    const parsed = selection.safeParse(await readMiniBody(request));
    if (!parsed.success) throw new QuickCheckError(400, 'INVALID_SELECTION', '请选择要分析的项目');
    const choice = parsed.data;
    const key = createHash('sha256').update(`mini-full-diagnosis:${id}:${userId}`).digest('hex');

    const target = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`mini-full-diagnosis:${userId}`}, 0))`;
      const previous = await tx.acquisitionIntent.findUnique({ where: { idempotencyKey: key }, include: { project: true } });
      if (previous?.project && previous.status === 'failed' && previous.errorCode?.startsWith('ANALYSIS_HTTP_')) {
        throw new QuickCheckError(409, 'DIAGNOSIS_FAILED', '上一次启动未成功。请前往网站分析页重新发起');
      }
      if (previous?.project) {
        return { intent: previous, project: previous.project };
      }
      let workspaceId: string;
      if (choice.mode === 'personal') {
        const memberships = await tx.workspaceMember.findFirst({ where: { userId }, select: { id: true } });
        if (memberships) throw new QuickCheckError(409, 'SELECT_WORKSPACE', '请选择已有工作区');
        const workspace = await tx.workspace.create({
          data: { name: `${new URL(report.targetUrl).hostname} 工作区`, members: { create: { userId, role: 'owner' } } },
        });
        workspaceId = workspace.id;
      } else {
        workspaceId = choice.workspaceId;
      }
      const membership = await tx.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
      if (!membership) throw new QuickCheckError(403, 'WORKSPACE_FORBIDDEN', '你没有该工作区的访问权限');
      const website = report.targetUrl;
      let project = await tx.project.findFirst({
        where: choice.mode === 'existing' ? { workspaceId, id: choice.projectId } : {
          workspaceId, OR: [{ url: website }, { productUrl: website }],
        },
      });
      if (!project) {
        if (choice.mode === 'existing') throw new QuickCheckError(404, 'PROJECT_NOT_FOUND', '未找到该项目');
        if (!['owner', 'admin', 'editor'].includes(membership.role)) {
          throw new QuickCheckError(403, 'WORKSPACE_FORBIDDEN', '你没有创建项目的权限');
        }
        if (choice.mode !== 'personal' && !await hasProjectCapacity(userId, workspaceId)) {
          throw new QuickCheckError(403, 'PLAN_LIMIT_REACHED', '当前工作区的项目额度已用完');
        }
        const name = new URL(website).hostname;
        const exists = await tx.project.findUnique({ where: { workspaceId_name: { workspaceId, name } } });
        project = await tx.project.create({
          data: { workspaceId, name: exists ? `${name}-${id.slice(-8)}` : name, url: website, productUrl: website, productName: name },
        });
      }
      const data = { projectId: project.id, status: 'project_ready', errorCode: null };
      const intent = await tx.acquisitionIntent.upsert({
        where: { idempotencyKey: key },
        create: {
          ...data, kind: 'website_diagnosis', userId, sessionId: report.acquisitionSessionId,
          targetUrl: website, idempotencyKey: key, expiresAt: new Date(Date.now() + 30 * 86400_000),
        },
        update: data,
      });
      return { intent, project };
    });

    const { intent, project } = target;
    const guardRequest = new NextRequest(new URL(`/api/integration/product-website/analyze?projectId=${encodeURIComponent(project.id)}`, request.url), {
      method: 'POST', headers: request.headers,
    });
    const guard = await resolveGuard(guardRequest, { workspaceId: project.workspaceId });
    if (!guard.ok) {
      if (guard.response.status !== 403) return guard.response;
      const denied = await guard.response.clone().json().catch(() => null);
      if (denied?.error !== 'NO_SUBSCRIPTION') return guard.response;
      const response = miniJson({ code: 'NO_SUBSCRIPTION', error: '当前工作区需要开通相应订阅', nextUrl: '/upgrade?module=visibility' }, 403);
      response.cookies.set('genilink-workspace', project.workspaceId, {
        path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
      });
      response.cookies.set('genilink-modules', '', { path: '/', maxAge: 0 });
      return response;
    }
    const payload = { nextUrl: '/website-analysis', projectId: project.id, workspaceId: project.workspaceId };
    const launched = (analysisId: number) => {
      const response = miniJson({ ...payload, analysisId });
      const cookies = { path: '/', httpOnly: false, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production' };
      response.cookies.set('genilink-workspace', project.workspaceId, cookies);
      response.cookies.set('genilink-project', project.id, cookies);
      response.cookies.set('genilink-modules', '', { ...cookies, maxAge: 0 });
      return response;
    };
    if (intent.analysisId) {
      await prisma.$transaction((tx) => reportEvent(tx, report, report.acquisitionSession, 'mini_full_diagnosis_started', userId));
      return launched(intent.analysisId);
    }
    const claim = await prisma.acquisitionIntent.updateMany({
      where: { id: intent.id, status: 'project_ready' }, data: { status: 'analysis_starting' },
    });
    if (!claim.count) return miniJson({ ...payload, status: 'processing' }, 202);
    const result = await startProductWebsiteAnalysis(guard.ctx, { requestedUrl: report.targetUrl, idempotencyKey: key });
    if ('response' in result) {
      const uncertain = result.response.status >= 502;
      const denied = result.response.status === 403 || result.response.status === 429;
      await prisma.acquisitionIntent.update({
        where: { id: intent.id },
        data: { status: uncertain ? 'analysis_unknown' : denied ? 'project_ready' : 'failed', errorCode: uncertain ? 'UPSTREAM_RESULT_UNKNOWN' : `ANALYSIS_HTTP_${result.response.status}` },
      });
      return uncertain ? miniJson({ ...payload, status: 'processing' }, 202) : result.response;
    }
    const data = result.data as { analysisId?: unknown; id?: unknown } | null;
    const analysisId = data?.analysisId ?? data?.id;
    if (typeof analysisId !== 'number' || !Number.isInteger(analysisId)) {
      await prisma.acquisitionIntent.update({ where: { id: intent.id }, data: { status: 'analysis_unknown', errorCode: 'UPSTREAM_MISSING_ANALYSIS_ID' } });
      return miniJson({ ...payload, status: 'processing' }, 202);
    }
    await prisma.$transaction(async (tx) => {
      await tx.acquisitionIntent.update({ where: { id: intent.id }, data: { status: 'diagnosis_started', analysisId } });
      await reportEvent(tx, report, report.acquisitionSession, 'mini_full_diagnosis_started', userId);
    });
    return launched(analysisId);
  });
}
