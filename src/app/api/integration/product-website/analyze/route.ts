import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { startProductWebsiteAnalysis } from '@/lib/product-website/start-analysis';

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
  const started = await startProductWebsiteAnalysis(result.ctx, {
    requestedUrl,
    enableAiCitation,
    crawlerProvider,
    idempotencyKey: req.headers.get('idempotency-key') || randomUUID(),
  });
  if ('response' in started) return started.response;
  return NextResponse.json(started.data);
}
