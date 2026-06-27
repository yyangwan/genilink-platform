import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/content-auth', () => ({
  withContentAuth: (handler: unknown) => async (req: NextRequest) =>
    (handler as (ctx: unknown, req: NextRequest) => Promise<Response>)(
      {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        role: 'owner',
        serviceToken: 'token-1',
      },
      req,
    ),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findFirst: vi.fn().mockResolvedValue({
        name: 'Project A',
        url: 'https://project.example',
        industry: 'SaaS',
        productName: 'Product A',
        productKeywords: ['AI', 'growth'],
        productDescription: 'Help the team create content',
        productUrl: 'https://product.example',
      }),
    },
  },
}));

vi.mock('@/lib/content/service', () => ({
  generateContent: vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ),
}));

import { generateContent } from '@/lib/content/service';
import { POST } from '@/app/api/content/[id]/generate/route';

describe('POST /api/content/[id]/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects project and product context into the generation payload', async () => {
    const req = new NextRequest('http://localhost/api/content/c1/generate', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-1',
        prompt: 'Write an introduction',
        topic: 'visibility optimization',
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'c1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        serviceToken: 'token-1',
      }),
      'c1',
      expect.objectContaining({
        prompt: 'Write an introduction',
        topic: 'visibility optimization',
        project_id: 'project-1',
        project_name: 'Project A',
        project_url: 'https://project.example',
        industry: 'SaaS',
        product_category: 'SaaS',
        product_name: 'Product A',
        product_keywords: ['AI', 'growth'],
        product_description: 'Help the team create content',
        product_url: 'https://product.example',
      }),
    );
  });
});
