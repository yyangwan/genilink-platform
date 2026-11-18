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
  getWorkspaceRole: vi.fn().mockResolvedValue('owner'),
}));

vi.mock('@/lib/auth/content-permissions', () => ({
  requirePermission: vi.fn().mockResolvedValue('owner'),
  PermissionDeniedError: class extends Error {},
}));

vi.mock('@/lib/auth/service-jwt', () => ({
  issueContentProjectJWT: vi.fn().mockResolvedValue('project-jwt'),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
    },
  },
}));

vi.mock('@/lib/proxy/zhijian-client', () => ({
  proxyRequest: vi.fn(),
}));

vi.mock('@/lib/billing/guard', () => ({
  requireBilling: vi.fn().mockResolvedValue({ capabilities: {} }),
  BillingError: class extends Error {},
}));

import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { BillingError, requireBilling } from '@/lib/billing/guard';
import { PermissionDeniedError, requirePermission } from '@/lib/auth/content-permissions';
import { GET } from '@/app/api/dashboard/content/route';

describe('GET /api/dashboard/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the content summary from the current content and analytics endpoints', async () => {
    (proxyRequest as ReturnType<typeof vi.fn>).mockImplementation(({ path }: { path: string }) => {
      if (path.startsWith('/api/content?')) {
        return Promise.resolve([
          { id: 'c1', title: 'First draft', platform: 'wechat', status: 'draft', createdAt: '2026-06-01T00:00:00Z' },
          { id: 'c2', title: 'Published post', platform: 'weibo', status: 'published', createdAt: '2026-06-02T00:00:00Z' },
        ]);
      }
      if (path.startsWith('/api/analytics?')) {
        return Promise.resolve({
          summary: {
            totalContent: 12,
            publishedCount: 5,
            avgQualityScore: 78,
          },
        });
      }
      return Promise.resolve(null);
    });

    const req = new NextRequest('http://localhost/api/dashboard/content?project=project-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      totalContent: 12,
      publishedCount: 5,
      recentContent: [
        { id: 'c2', title: 'Published post', platform: 'weibo', createdAt: '2026-06-02T00:00:00Z' },
        { id: 'c1', title: 'First draft', platform: 'wechat', createdAt: '2026-06-01T00:00:00Z' },
      ],
      qualityAvg: 78,
      _meta: {
        projectCount: 2,
        serviceAvailable: true,
      },
    });

    expect(proxyRequest).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      service: 'content',
      path: '/api/content?projectId=project-1',
      accessToken: 'project-jwt',
    }));
    expect(proxyRequest).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      service: 'content',
      path: '/api/analytics?timeRange=30',
      accessToken: 'project-jwt',
    }));
  });

  it('uses the project-scoped workbench endpoint and preserves status and update time', async () => {
    const items = [{ id: 'draft', title: 'Updated draft', platform: 'wechat', status: 'draft',
      createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-04T00:00:00Z' }];
    vi.mocked(proxyRequest).mockResolvedValueOnce({ project_id: 'project-1', items });
    const response = await GET(new NextRequest('http://localhost/api/dashboard/content?project=project-1&view=workbench'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ recentContent: items });
    expect(proxyRequest).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      projectId: 'project-1', path: '/api/content/workbench?projectId=project-1', accessToken: 'project-jwt',
    }));
  });

  it('requires the same read permission as the content detail', async () => {
    vi.mocked(requirePermission).mockRejectedValueOnce(new PermissionDeniedError('read', 'viewer'));
    const response = await GET(new NextRequest('http://localhost/api/dashboard/content?project=project-1&view=workbench'));
    expect(response.status).toBe(403);
    expect(proxyRequest).not.toHaveBeenCalled();
  });

  it('rejects content returned for a different project', async () => {
    vi.mocked(proxyRequest).mockResolvedValueOnce({ project_id: 'project-2', items: [] });
    const response = await GET(new NextRequest('http://localhost/api/dashboard/content?project=project-1&view=workbench'));
    expect(response.status).toBe(503);
  });

  it('reports an unavailable service rather than an empty project in the workbench', async () => {
    vi.mocked(proxyRequest).mockRejectedValueOnce(new Error('Service unavailable'));
    const response = await GET(new NextRequest('http://localhost/api/dashboard/content?project=project-1&view=workbench'));
    expect(response.status).toBe(503);
  });

  it('returns an empty summary when no project is selected', async () => {
    const req = new NextRequest('http://localhost/api/dashboard/content');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      totalContent: 0,
      publishedCount: 0,
      recentContent: [],
      qualityAvg: null,
    });
    expect(proxyRequest).not.toHaveBeenCalled();
  });

  it('returns a subscription state instead of an empty summary when content access is not active', async () => {
    vi.mocked(requireBilling).mockRejectedValueOnce(new BillingError('content'));

    const req = new NextRequest('http://localhost/api/dashboard/content?project=project-1');
    const res = await GET(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'NO_SUBSCRIPTION', module: 'content' });
  });
});
