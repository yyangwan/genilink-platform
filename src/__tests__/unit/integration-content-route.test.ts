import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
  }),
}));

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('workspace-1'),
}));

vi.mock('@/lib/auth/workspace', () => ({
  verifyProjectInWorkspace: vi.fn().mockResolvedValue({ id: 'project-1' }),
  getWorkspaceRole: vi.fn().mockResolvedValue('owner'),
}));

vi.mock('@/lib/billing/guard', () => ({
  requireBilling: vi.fn().mockResolvedValue(undefined),
  BillingError: class extends Error {},
}));

vi.mock('@/lib/auth/service-jwt', () => ({
  issueContentProjectJWT: vi.fn().mockResolvedValue('project-jwt'),
}));

vi.mock('@/lib/proxy/zhijian-client', () => ({
  proxyRequest: vi.fn(),
}));

import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { GET } from '@/app/api/integration/content/route';

describe('GET /api/integration/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the summary payload in the legacy wrapper shape', async () => {
    (proxyRequest as ReturnType<typeof vi.fn>).mockImplementation(({ path }: { path: string }) => {
      if (path.startsWith('/api/content?')) {
        return Promise.resolve([
          { id: 'c1', title: 'Draft', platform: 'wechat', status: 'draft', createdAt: '2026-06-01T00:00:00Z' },
        ]);
      }
      if (path.startsWith('/api/analytics?')) {
        return Promise.resolve({
          summary: {
            totalContent: 1,
            publishedCount: 0,
            avgQualityScore: 60,
          },
        });
      }
      return Promise.resolve(null);
    });

    const req = new NextRequest('http://localhost/api/integration/content?projectId=project-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(proxyRequest).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      service: 'content',
      path: '/api/content?projectId=project-1',
      accessToken: 'project-jwt',
    }));
    expect(data).toEqual({
      data: {
        totalContent: 1,
        publishedCount: 0,
        recentContent: [
          { id: 'c1', title: 'Draft', platform: 'wechat', createdAt: '2026-06-01T00:00:00Z' },
        ],
        qualityAvg: 60,
        _meta: {
          projectCount: 1,
          serviceAvailable: true,
        },
      },
    });
  });
});
