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

vi.mock('@/lib/auth/service-jwt', () => ({
  issueVisibilityProjectJWT: vi.fn().mockResolvedValue('project-jwt'),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
    },
  },
}));

vi.mock('@/lib/proxy/zhijian-client', () => ({
  proxyRequest: vi.fn().mockResolvedValue({
    overallScore: 73,
    mentionCount: 12,
    platformCoverage: [{ name: 'ChatGPT', score: 80 }],
    suggestions: [{ text: 'Improve comparison content', priority: 'high' }],
  }),
}));

import { proxyRequest } from '@/lib/proxy/zhijian-client';
import { GET } from '@/app/api/dashboard/geo/route';

describe('GET /api/dashboard/geo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the current Visibility integration summary endpoint', async () => {
    const req = new NextRequest('http://localhost/api/dashboard/geo?project=project-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(proxyRequest).toHaveBeenCalledWith({
      projectId: 'project-1',
      service: 'visibility',
      path: '/api/integration/summary?project_id=project-1',
      accessToken: 'project-jwt',
    });
    expect(data).toEqual({
      websites: [{
        id: 'ChatGPT',
        name: 'ChatGPT',
        domain: 'ChatGPT',
        aiScore: 80,
        citationCount: 0,
        lastAnalyzedAt: null,
      }],
      totalCitations: 12,
      avgAiScore: 73,
      optimizationTasks: [{ text: 'Improve comparison content', priority: 'high', status: 'pending' }],
    });
  });

  it('returns an empty geo summary when no project is selected', async () => {
    const req = new NextRequest('http://localhost/api/dashboard/geo');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      websites: [],
      totalCitations: 0,
      avgAiScore: null,
      optimizationTasks: [],
    });
    expect(proxyRequest).not.toHaveBeenCalled();
  });
});
