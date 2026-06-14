import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/proxy/route-guard', () => ({
  resolveGuard: vi.fn(),
  fetchUpstream: vi.fn(),
}));

import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { DELETE } from '@/app/api/integration/prompts/[id]/route';

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
});
