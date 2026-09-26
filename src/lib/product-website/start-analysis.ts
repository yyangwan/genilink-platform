import { NextResponse } from 'next/server';
import type { GuardContext } from '@/lib/proxy/route-guard';
import { fetchUpstream } from '@/lib/proxy/route-guard';
import {
  buildProductWebsiteAnalyzePayload,
  getProductWebsiteBrands,
  getProductWebsiteProject,
} from '@/lib/product-website/context';
import { planLimitResponse } from '@/lib/billing/usage';
import {
  commitUsageOperation,
  markPendingReconcile,
  releaseUsageOperation,
  reserveContentGeneration,
} from '@/lib/billing/usage-reservations';
import { requestHash } from '@/lib/billing/idempotency';

type AnalysisContext = Pick<GuardContext, 'session' | 'workspaceId' | 'projectId' | 'headers' | 'upstreamUrl'>;

export function websiteAnalysisOperationId(idempotencyKey: string) {
  return `website-analysis:${idempotencyKey}`;
}

export async function startProductWebsiteAnalysis(
  ctx: AnalysisContext,
  input: {
    requestedUrl?: unknown;
    enableAiCitation?: unknown;
    crawlerProvider?: unknown;
    idempotencyKey: string;
  },
): Promise<{ data: unknown } | { response: NextResponse }> {
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(input.idempotencyKey)) {
    return {
      response: NextResponse.json(
        { error: '分析请求键格式无效', code: 'ANALYSIS_IDEMPOTENCY_KEY_INVALID' },
        { status: 400 },
      ),
    };
  }
  const project = await getProductWebsiteProject(ctx.projectId, ctx.workspaceId);
  if (!project) return { response: NextResponse.json({ error: 'Project not found' }, { status: 404 }) };

  const brands = await getProductWebsiteBrands(ctx.projectId);
  const payload = buildProductWebsiteAnalyzePayload({
    projectId: ctx.projectId,
    workspaceId: ctx.workspaceId,
    project,
    brands,
    requestedUrl: input.requestedUrl,
    enableAiCitation: input.enableAiCitation,
    crawlerProvider: input.crawlerProvider,
  });
  if ('error' in payload) {
    return { response: NextResponse.json({ error: payload.error }, { status: 400 }) };
  }

  const operationId = websiteAnalysisOperationId(input.idempotencyKey);
  const reservation = await reserveContentGeneration({
    userId: ctx.session.user.id,
    workspaceId: ctx.workspaceId,
    feature: 'website_analysis',
    operationId,
    requestHash: requestHash({ projectId: ctx.projectId, targetUrl: payload.target_url }),
    metadata: { projectId: ctx.projectId },
  });
  if (reservation.type === 'limit') {
    return { response: planLimitResponse(reservation.error) };
  }
  if (reservation.type === 'conflict' || (reservation.type === 'replay' && reservation.status === 'released')) {
    return {
      response: NextResponse.json(
        { error: '分析请求键已用于其他请求', code: 'ANALYSIS_IDEMPOTENCY_CONFLICT' },
        { status: 409 },
      ),
    };
  }

  const upstream = await fetchUpstream(ctx, '/api/product-website/analyze', {
    method: 'POST',
    body: payload,
    headers: { 'Idempotency-Key': input.idempotencyKey },
    timeoutMs: 30_000,
    errorMessage: 'Failed to create product website analysis',
  });
  if ('response' in upstream) {
    if (upstream.response.status >= 502) await markPendingReconcile(operationId);
    else await releaseUsageOperation(operationId, `analysis:http-${upstream.response.status}`);
    return upstream;
  }

  await commitUsageOperation(operationId);
  return upstream;
}
