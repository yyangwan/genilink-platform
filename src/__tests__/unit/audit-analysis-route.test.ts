import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveGuardMock = vi.fn();
const fetchUpstreamMock = vi.fn();

vi.mock('@/lib/proxy/route-guard', () => ({
  resolveGuard: (...args: unknown[]) => resolveGuardMock(...args),
  fetchUpstream: (...args: unknown[]) => fetchUpstreamMock(...args),
}));

import { GET, POST } from '@/app/api/integration/audits/[id]/analyze/route';

const context = {
  session: { user: { id: 'u1' } },
  workspaceId: 'w1',
  projectId: 'p1',
  serviceToken: 'token',
  upstreamUrl: (path: string) => `http://127.0.0.1:8000${path}`,
  headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
};

describe('/api/integration/audits/[id]/analyze', () => {
  beforeEach(() => {
    resolveGuardMock.mockReset();
    fetchUpstreamMock.mockReset();
    resolveGuardMock.mockResolvedValue({ ok: true, ctx: context });
  });

  it('starts analysis without charging a second visibility-audit usage entry', async () => {
    fetchUpstreamMock.mockResolvedValue({ data: { message: 'Analysis started', audit_id: 22 } });
    const req = new NextRequest('http://localhost/api/integration/audits/22/analyze?projectId=p1', {
      method: 'POST',
    });

    const res = await POST(req, { params: Promise.resolve({ id: '22' }) });

    expect(res.status).toBe(200);
    expect(fetchUpstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1' }),
      '/api/analysis/audits/22/analyze',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lists response-analysis rows so completed audits can be backfilled safely', async () => {
    fetchUpstreamMock.mockResolvedValue({ data: [] });
    const req = new NextRequest('http://localhost/api/integration/audits/22/analyze?projectId=p1');

    const res = await GET(req, { params: Promise.resolve({ id: '22' }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(fetchUpstreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1' }),
      '/api/analysis/audits/22/analysis',
      expect.objectContaining({ errorMessage: 'Failed to fetch audit analysis' }),
    );
  });
});
