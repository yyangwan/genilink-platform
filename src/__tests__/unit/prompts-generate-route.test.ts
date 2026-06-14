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
  },
}));

import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { POST } from '@/app/api/integration/prompts/generate/route';

describe('POST /api/integration/prompts/generate', () => {
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
      id: 'project-1',
      name: 'Project Alpha',
      url: 'https://example.com',
      industry: 'SaaS',
      productName: 'Alpha product',
      productKeywords: ['AI', 'search'],
      productDescription: 'A product description',
      productUrl: 'https://product.example.com',
      workspaceId: 'workspace-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ok: true } });
  });

  it('injects project product fields into the upstream prompt generation request', async () => {
    const req = new NextRequest('http://localhost/api/integration/prompts/generate?projectId=project-1', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-1',
        tone: 'formal',
        product_name: 'spoofed product',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(fetchUpstream).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/prompts/generate',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          project_id: 'project-1',
          project_name: 'Project Alpha',
          project_url: 'https://example.com',
          industry: 'SaaS',
          product_category: 'SaaS',
          product_name: 'Alpha product',
          product_keywords: ['AI', 'search'],
          product_description: 'A product description',
          product_url: 'https://product.example.com',
          tone: 'formal',
        }),
      }),
    );
  });
});
