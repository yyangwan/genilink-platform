import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/auth/wechat/qrcode/route';
import { prisma } from '@/lib/db';

describe('GET /api/auth/wechat/qrcode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('WECHAT_MP_APPID', '');
    vi.stubEnv('WECHAT_MP_SECRET', '');
    vi.stubEnv('WECHAT_MP_TOKEN', '');
    vi.stubEnv('AUTH_SECRET', 'test-secret');

    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1' });
    (prisma.workspace.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'workspace-1' });
    (prisma.workspaceMember.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (prisma.wechatLoginSession.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('returns a local development QR payload when the公众号 is not configured', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.devMode).toBe(true);
    expect(data.scene).toMatch(/^[a-f0-9]{24}$/);
    expect(data.url).toContain('data:image/svg+xml');
    expect(prisma.wechatLoginSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'confirmed',
          userId: 'user-1',
          token: expect.any(String),
        }),
      }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
