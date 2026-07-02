import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/proxy/route-guard', () => ({
  resolveGuard: vi.fn(),
  fetchUpstream: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
    projectBrand: {
      findMany: vi.fn(),
    },
  },
}));

import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { POST } from '@/app/api/integration/product-website/analyze/route';

describe('POST /api/integration/product-website/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveGuard).mockResolvedValue({
      ok: true,
      ctx: {
        session: { user: { id: 'user-1' } },
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        serviceToken: 'token-1',
        upstreamUrl: (path: string) => `http://upstream${path}`,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
      },
    });
    vi.mocked(prisma.project.findFirst).mockResolvedValue({
      name: 'Project Alpha',
      url: 'https://example.com',
      industry: 'SaaS',
      productName: 'Alpha Product',
      productKeywords: ['AI search', 'visibility'],
      productDescription: 'AI visibility platform',
      productUrl: 'https://example.com/product',
    } as never);
    vi.mocked(prisma.projectBrand.findMany).mockResolvedValue([
      {
        id: 'assoc-1',
        projectId: 'project-1',
        brandId: 'brand-1',
        createdAt: new Date(),
        brand: {
          id: 'brand-1',
          name: 'Alpha',
          aliases: ['Alpha AI'],
          isCompetitor: false,
          logo: null,
          website: null,
          description: null,
          remoteIds: null,
          workspaceId: 'workspace-1',
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ] as never);
    vi.mocked(fetchUpstream).mockResolvedValue({
      data: { analysisId: 'pwa_1', status: 'queued' },
    });
  });

  it('builds a product-aware upstream analysis request', async () => {
    const req = new NextRequest('http://localhost/api/integration/product-website/analyze?projectId=project-1', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-1',
        url: 'example.com/custom#top',
        enableAiCitation: true,
        crawlerProvider: 'firecrawl',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ analysisId: 'pwa_1', status: 'queued' });
    expect(fetchUpstream).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/product-website/analyze',
      expect.objectContaining({
        method: 'POST',
        body: {
          project_id: 'project-1',
          workspace_id: 'workspace-1',
          target_url: 'https://example.com/custom',
          project: {
            name: 'Project Alpha',
            url: 'https://example.com',
            industry: 'SaaS',
            product_name: 'Alpha Product',
            product_keywords: ['AI search', 'visibility'],
            product_description: 'AI visibility platform',
            product_url: 'https://example.com/product',
          },
          brands: [
            {
              id: 'brand-1',
              name: 'Alpha',
              aliases: ['Alpha AI'],
              is_competitor: false,
            },
          ],
          options: {
            enable_ai_citation: true,
            crawler_provider: 'firecrawl',
          },
        },
      }),
    );
  });

  it('falls back to the project product URL when no URL is provided', async () => {
    const req = new NextRequest('http://localhost/api/integration/product-website/analyze?projectId=project-1', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'project-1' }),
      headers: { 'Content-Type': 'application/json' },
    });

    await POST(req);

    expect(fetchUpstream).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/product-website/analyze',
      expect.objectContaining({
        body: expect.objectContaining({
          target_url: 'https://example.com/product',
        }),
      }),
    );
  });

  it('rejects unsafe target URLs before calling upstream', async () => {
    const req = new NextRequest('http://localhost/api/integration/product-website/analyze?projectId=project-1', {
      method: 'POST',
      body: JSON.stringify({ projectId: 'project-1', url: 'http://127.0.0.1:8000' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: 'Target URL is not allowed' });
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
});
