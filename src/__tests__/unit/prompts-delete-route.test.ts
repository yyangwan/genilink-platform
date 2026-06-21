import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/proxy/route-guard', () => ({
  resolveGuard: vi.fn(),
  fetchUpstream: vi.fn(),
}));

import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { DELETE, PATCH, PUT } from '@/app/api/integration/prompts/[id]/route';

describe('DELETE /api/integration/prompts/[id]', () => {
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
    vi.mocked(fetchUpstream).mockResolvedValue({ data: {} });
  });

  it('uses the prompt id on the top-level prompt endpoint', async () => {
    const req = new NextRequest('http://localhost/api/integration/prompts/prompt-9?projectId=project-1', {
      method: 'DELETE',
    });

    const res = await DELETE(req, { params: Promise.resolve({ id: 'prompt-9' }) });

    expect(res.status).toBe(204);
    expect(fetchUpstream).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/prompts/prompt-9?project_id=project-1',
      expect.objectContaining({
        method: 'DELETE',
        timeoutMs: 30_000,
        errorMessage: 'Failed to delete prompt',
      }),
    );
  });

  it('injects project_id into upstream update prompt body', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({
      data: { id: 9, project_id: 'project-1', text: 'updated prompt', category: 'recommend' },
    });

    const req = new NextRequest('http://localhost/api/integration/prompts/9?projectId=project-1', {
      method: 'PUT',
      body: JSON.stringify({
        projectId: 'project-1',
        text: 'updated prompt',
        category: 'recommend',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PUT(req, { params: Promise.resolve({ id: '9' }) });

    expect(res.status).toBe(200);
    expect(fetchUpstream).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/prompts/9?project_id=project-1',
      expect.objectContaining({
        method: 'PUT',
        body: {
          text: 'updated prompt',
          category: 'recommend',
          project_id: 'project-1',
        },
      }),
    );
  });

  it('injects project_id into upstream patch prompt body', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({
      data: { id: 9, project_id: 'project-1', text: 'patched prompt', category: 'recommend' },
    });

    const req = new NextRequest('http://localhost/api/integration/prompts/9?projectId=project-1', {
      method: 'PATCH',
      body: JSON.stringify({
        projectId: 'project-1',
        text: 'patched prompt',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: '9' }) });

    expect(res.status).toBe(200);
    expect(fetchUpstream).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/prompts/9?project_id=project-1',
      expect.objectContaining({
        method: 'PATCH',
        body: {
          text: 'patched prompt',
          project_id: 'project-1',
        },
      }),
    );
  });
});
