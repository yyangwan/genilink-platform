import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { evaluateContentQuality } from '@/lib/content/service';
import { POST } from '@/app/api/content/[id]/score/route';

vi.mock('@/lib/auth/content-auth', () => ({
  withContentAuth: vi.fn((handler) => (req: NextRequest) =>
    handler(
      {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        role: 'owner',
        serviceToken: 'service-token',
      },
      req,
    ),
  ),
}));

vi.mock('@/lib/content/service', () => ({
  evaluateContentQuality: vi.fn(),
}));

vi.mock('@/lib/proxy/proxy-errors', () => ({
  handleProxyError: vi.fn(() => Response.json({ error: 'proxy error' }, { status: 502 })),
}));

function mockRequest(body: unknown) {
  return new NextRequest('http://localhost/api/content/content-1/score', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('/api/content/[id]/score', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('evaluates quality and returns a 0-100 score for edit page compatibility', async () => {
    vi.mocked(evaluateContentQuality).mockResolvedValue({
      quality: 8,
      engagement: 7,
      brandVoice: 6,
      platformFit: 9,
    });

    const res = await POST(
      mockRequest({ projectId: 'project-1', platform: 'wechat' }),
      { params: Promise.resolve({ id: 'content-1' }) },
    );

    expect(res.status).toBe(200);
    expect(evaluateContentQuality).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1' }),
      'content-1',
      { platform: 'wechat' },
    );
    await expect(res.json()).resolves.toMatchObject({
      data: {
        quality: 8,
        score: 80,
        qualityScore: 80,
      },
    });
  });
});
