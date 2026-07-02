import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import {
  buildProductWebsiteAnalyzePayload,
  getProductWebsiteBrands,
  getProductWebsiteProject,
} from '@/lib/product-website/context';

export async function POST(req: NextRequest) {
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  const body = await req.json().catch(() => ({}));
  const requestedUrl = body && typeof body === 'object' && 'url' in body
    ? (body as { url?: unknown }).url
    : undefined;
  const enableAiCitation = body && typeof body === 'object' && 'enableAiCitation' in body
    ? (body as { enableAiCitation?: unknown }).enableAiCitation
    : undefined;
  const crawlerProvider = body && typeof body === 'object' && 'crawlerProvider' in body
    ? (body as { crawlerProvider?: unknown }).crawlerProvider
    : undefined;
  const project = await getProductWebsiteProject(result.ctx.projectId, result.ctx.workspaceId);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const brands = await getProductWebsiteBrands(result.ctx.projectId);
  const payload = buildProductWebsiteAnalyzePayload({
    projectId: result.ctx.projectId,
    workspaceId: result.ctx.workspaceId,
    project,
    brands,
    requestedUrl,
    enableAiCitation,
    crawlerProvider,
  });

  if ('error' in payload) {
    return NextResponse.json({ error: payload.error }, { status: 400 });
  }

  const upstream = await fetchUpstream(result.ctx, '/api/product-website/analyze', {
    method: 'POST',
    body: payload,
    timeoutMs: 30_000,
    errorMessage: 'Failed to create product website analysis',
  });
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
