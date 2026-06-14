import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resolveGuardMock = vi.fn();
const fetchUpstreamMock = vi.fn();

vi.mock('@/lib/proxy/route-guard', () => ({
  resolveGuard: (...args: unknown[]) => resolveGuardMock(...args),
  fetchUpstream: (...args: unknown[]) => fetchUpstreamMock(...args),
}));

import { GET } from '@/app/api/integration/audits/[id]/results/route';

describe('GET /api/integration/audits/[id]/results', () => {
  beforeEach(() => {
    resolveGuardMock.mockReset();
    fetchUpstreamMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('uses project-scoped guard so audit results can reach the backend', async () => {
    resolveGuardMock.mockResolvedValue({
      ok: true,
      ctx: {
        session: { user: { id: 'u1' } },
        workspaceId: 'w1',
        projectId: 'p1',
        serviceToken: 'token',
        upstreamUrl: (path: string) => `http://127.0.0.1:8000${path}`,
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      },
    });
    fetchUpstreamMock.mockResolvedValue({ data: [] });

    const req = new NextRequest('http://localhost/api/integration/audits/22/results?projectId=p1');
    const res = await GET(req, { params: Promise.resolve({ id: '22' }) });

    expect(resolveGuardMock).toHaveBeenCalledWith(req);
    expect(fetchUpstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1' }),
      '/api/audits/22/results',
      expect.objectContaining({ errorMessage: 'Failed to fetch audit results' }),
    );
    expect(res.status).toBe(200);
  });
});
