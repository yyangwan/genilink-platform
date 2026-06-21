import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/proxy/route-guard', () => ({
  resolveGuard: vi.fn(),
  fetchUpstream: vi.fn(),
}));

import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { DELETE, GET, PATCH } from '@/app/api/integration/suggestions/[id]/route';

const guardCtx = {
  session: { user: { id: 'user-1' } },
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  serviceToken: 'token-1',
  upstreamUrl: (path: string) => `http://upstream${path}`,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
};

describe('/api/integration/suggestions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveGuard).mockResolvedValue({
      ok: true,
      ctx: guardCtx,
    });
  });

  it('loads suggestion detail from the project-scoped suggestions list', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({
      data: [
        { id: 153, title: 'Other suggestion' },
        {
          id: 154,
          report_id: 9,
          audit_id: 7,
          title: 'Target suggestion',
          description: 'Detailed recommendation',
          priority: 'high',
          detail: {
            evidence_summary: 'Mention rate dropped on DeepSeek',
            audit_findings: ['DeepSeek did not cite owned pages'],
            success_metric: 'Recover DeepSeek mention rate to 60%',
            evidence_sources: ['zhihu.com/question/456'],
            evidence_channels: ['知乎'],
            action_sources: ['brand.com/blog/compare'],
            action_channels: ['content'],
            action_type: '发布对比页',
          },
        },
      ],
    });

    const req = new NextRequest('http://localhost/api/integration/suggestions/154?projectId=project-1');

    const res = await GET(req, { params: Promise.resolve({ id: '154' }) });
    const body = await res.json();

    expect(resolveGuard).toHaveBeenCalledWith(req);
    expect(fetchUpstream).toHaveBeenCalledWith(
      guardCtx,
      '/api/suggestions/project-1',
      expect.objectContaining({ errorMessage: 'Failed to fetch suggestion' }),
    );
    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      id: '154',
      report_id: 9,
      audit_id: 7,
      text: 'Target suggestion',
      description: 'Detailed recommendation',
      priority: 'high',
      evidence_summary: 'Mention rate dropped on DeepSeek',
      audit_findings: ['DeepSeek did not cite owned pages'],
      success_metric: 'Recover DeepSeek mention rate to 60%',
      evidence_sources: ['zhihu.com/question/456'],
      evidence_channels: ['知乎'],
      action_sources: ['brand.com/blog/compare'],
      action_channels: ['content'],
      action_type: '发布对比页',
    });
  });

  it('returns 404 when the project-scoped list does not contain the suggestion', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: [{ id: 153, title: 'Other suggestion' }] });

    const req = new NextRequest('http://localhost/api/integration/suggestions/154?projectId=project-1');

    const res = await GET(req, { params: Promise.resolve({ id: '154' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body).toEqual({ error: 'Suggestion not found' });
  });

  it('uses project-scoped guard for resolving a suggestion', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { id: 154, is_resolved: true } });
    const req = new NextRequest('http://localhost/api/integration/suggestions/154?projectId=project-1', {
      method: 'PATCH',
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '154' }) });

    expect(resolveGuard).toHaveBeenCalledWith(req);
    expect(fetchUpstream).toHaveBeenCalledWith(
      guardCtx,
      '/api/suggestions/154/resolve',
      expect.objectContaining({
        method: 'PATCH',
        timeoutMs: 30_000,
      }),
    );
    expect(res.status).toBe(200);
  });

  it('uses project-scoped guard for deleting a suggestion', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: null });
    const req = new NextRequest('http://localhost/api/integration/suggestions/154?projectId=project-1', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: '154' }) });

    expect(resolveGuard).toHaveBeenCalledWith(req);
    expect(fetchUpstream).toHaveBeenCalledWith(
      guardCtx,
      '/api/suggestions/154',
      expect.objectContaining({
        method: 'DELETE',
        timeoutMs: 30_000,
      }),
    );
    expect(res.status).toBe(204);
  });

  it('returns guard failures without calling upstream', async () => {
    const response = NextResponse.json({ error: 'Project not found in workspace' }, { status: 403 });
    vi.mocked(resolveGuard).mockResolvedValue({ ok: false, response });
    const req = new NextRequest('http://localhost/api/integration/suggestions/154?projectId=project-1');

    const res = await GET(req, { params: Promise.resolve({ id: '154' }) });

    expect(res.status).toBe(403);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
});
