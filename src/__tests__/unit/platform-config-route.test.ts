import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { setPlatformConfig } = vi.hoisted(() => ({ setPlatformConfig: vi.fn() }));

vi.mock('@/lib/auth/content-auth', () => ({
  withContentAuth: (handler: (ctx: unknown, req: NextRequest) => Promise<Response>) =>
    (req: NextRequest) => handler({
      userId: 'user-real',
      workspaceId: 'workspace-real',
      projectId: 'project-real',
      role: 'owner',
      serviceToken: 'signed-token',
    }, req),
}));

vi.mock('@/lib/content/service', () => ({
  getPlatformConfig: vi.fn(),
  setPlatformConfig,
  deletePlatformConfig: vi.fn(),
}));

import { POST } from '@/app/api/platform-config/[platform]/route';

describe('platform config route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlatformConfig.mockResolvedValue({ config: { platform: 'wechat', enabled: true, appId: 'app-1' } });
  });

  it('passes only validated credentials and relies on the authenticated project context for binding', async () => {
    const request = new NextRequest('http://localhost/api/platform-config/wechat?projectId=project-real', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'project-real',
        appId: 'app-1',
        appSecret: 'secret-1',
        accountName: '品牌公众号',
        userId: 'spoofed-user',
        workspaceId: 'spoofed-workspace',
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ platform: 'wechat' }) });

    expect(response.status).toBe(200);
    expect(setPlatformConfig).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-real', projectId: 'project-real' }),
      'wechat',
      { appId: 'app-1', appSecret: 'secret-1', accountName: '品牌公众号' },
    );
  });

  it('rejects platform ids outside the supported publishing catalog', async () => {
    const request = new NextRequest('http://localhost/api/platform-config/unknown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-real', accessToken: 'token' }),
    });

    const response = await POST(request, { params: Promise.resolve({ platform: 'unknown' }) });

    expect(response.status).toBe(404);
    expect(setPlatformConfig).not.toHaveBeenCalled();
  });
});
