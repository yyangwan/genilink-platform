import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/proxy/route-guard', () => ({
  resolveGuard: vi.fn(),
  fetchUpstream: vi.fn(),
}));

import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { GET, POST } from '@/app/api/integration/prompts/route';

describe('GET /api/integration/prompts', () => {
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
  });

  it('normalizes prompt ids from prompt_id', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({
      data: [
        { prompt_id: 298, text: 'Use the project id', platform: 'ChatGPT', category: 'brand' },
      ],
    });

    const req = new NextRequest('http://localhost/api/integration/prompts?projectId=project-1');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual([
      {
        id: '298',
        prompt_id: 298,
        text: 'Use the project id',
        platform: 'ChatGPT',
        category: 'brand',
      },
    ]);
  });

  it('injects project_id into upstream create prompt body', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({
      data: [{ id: 1, project_id: 'project-1', text: 'test prompt', category: 'recommend' }],
    });

    const req = new NextRequest('http://localhost/api/integration/prompts?projectId=project-1', {
      method: 'POST',
      body: JSON.stringify({
        projectId: 'project-1',
        text: 'test prompt',
        category: 'recommend',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(fetchUpstream).toHaveBeenCalledWith(
      expect.any(Object),
      '/api/prompts?project_id=project-1',
      expect.objectContaining({
        method: 'POST',
        body: {
          text: 'test prompt',
          category: 'recommend',
          project_id: 'project-1',
        },
      }),
    );
  });
});
