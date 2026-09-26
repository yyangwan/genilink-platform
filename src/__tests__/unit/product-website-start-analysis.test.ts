import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  getProject: vi.fn(),
  getBrands: vi.fn(),
  buildPayload: vi.fn(),
  reserve: vi.fn(),
  commit: vi.fn(),
  pending: vi.fn(),
  release: vi.fn(),
  fetchUpstream: vi.fn(),
}));

vi.mock('@/lib/product-website/context', () => ({
  getProductWebsiteProject: mocks.getProject,
  getProductWebsiteBrands: mocks.getBrands,
  buildProductWebsiteAnalyzePayload: mocks.buildPayload,
}));
vi.mock('@/lib/billing/usage-reservations', () => ({
  reserveContentGeneration: mocks.reserve,
  commitUsageOperation: mocks.commit,
  markPendingReconcile: mocks.pending,
  releaseUsageOperation: mocks.release,
}));
vi.mock('@/lib/proxy/route-guard', () => ({ fetchUpstream: mocks.fetchUpstream }));

import { startProductWebsiteAnalysis } from '@/lib/product-website/start-analysis';

const ctx = {
  session: { user: { id: 'user-1' } },
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
  upstreamUrl: (path: string) => `http://visibility${path}`,
};

describe('startProductWebsiteAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProject.mockResolvedValue({ id: 'project-1' });
    mocks.getBrands.mockResolvedValue([]);
    mocks.buildPayload.mockReturnValue({
      project_id: 'project-1',
      workspace_id: 'workspace-1',
      target_url: 'https://example.com/',
    });
    mocks.reserve.mockResolvedValue({ type: 'reserved', usageEventId: 'usage-1' });
    mocks.commit.mockResolvedValue({ ok: true });
    mocks.pending.mockResolvedValue(undefined);
    mocks.release.mockResolvedValue({ ok: true });
  });

  it('forwards the stable request key and commits reserved usage after creation', async () => {
    mocks.fetchUpstream.mockResolvedValue({ data: { analysisId: 42 } });

    const result = await startProductWebsiteAnalysis(ctx, {
      requestedUrl: 'https://example.com/',
      idempotencyKey: 'intent-request-key-1234',
    });

    expect(result).toEqual({ data: { analysisId: 42 } });
    expect(mocks.fetchUpstream).toHaveBeenCalledWith(
      ctx,
      '/api/product-website/analyze',
      expect.objectContaining({ headers: { 'Idempotency-Key': 'intent-request-key-1234' } }),
    );
    expect(mocks.commit).toHaveBeenCalledWith('website-analysis:intent-request-key-1234');
  });

  it('keeps usage reserved for reconciliation when the upstream result is unknown', async () => {
    mocks.fetchUpstream.mockResolvedValue({
      response: NextResponse.json({ error: 'timeout' }, { status: 504 }),
    });

    await startProductWebsiteAnalysis(ctx, {
      requestedUrl: 'https://example.com/',
      idempotencyKey: 'intent-request-key-1234',
    });

    expect(mocks.pending).toHaveBeenCalledWith('website-analysis:intent-request-key-1234');
    expect(mocks.release).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('releases reserved usage after a definitive upstream rejection', async () => {
    mocks.fetchUpstream.mockResolvedValue({
      response: NextResponse.json({ error: 'bad request' }, { status: 400 }),
    });

    await startProductWebsiteAnalysis(ctx, {
      requestedUrl: 'https://example.com/',
      idempotencyKey: 'intent-request-key-1234',
    });

    expect(mocks.release).toHaveBeenCalledWith(
      'website-analysis:intent-request-key-1234',
      'analysis:http-400',
    );
  });
});
