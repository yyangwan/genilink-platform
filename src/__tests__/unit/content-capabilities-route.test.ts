// 评审 R6：手工新建内容入口依赖 /api/content/capabilities 初始化平台选择。
// 覆盖：正常返回平台能力；上游不可用时回落保守快照（四个已实现平台），
// 保证手工入口不因 ContentOS 故障而无法选择平台（空列表会让提交按钮永久禁用）。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/content-auth', () => ({
  withContentAuth: (handler: unknown) => async (req: NextRequest) =>
    (handler as (ctx: unknown, req: NextRequest) => Promise<Response>)(
      {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        role: 'member',
        serviceToken: 'content-jwt',
      },
      req,
    ),
}));

const { getGenerationCapabilities } = vi.hoisted(() => ({
  getGenerationCapabilities: vi.fn(),
}));

vi.mock('@/lib/content/capabilities', () => ({
  getGenerationCapabilities,
}));

import { GET } from '@/app/api/content/capabilities/route';

describe('GET /api/content/capabilities（R6 手工入口平台初始化）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns platform capabilities for the manual creation flow', async () => {
    getGenerationCapabilities.mockResolvedValue({
      schemaVersion: 1,
      platforms: {
        wechat: { enabled: true },
        weibo: { enabled: true },
        zhihu: { enabled: false, reason: 'generator_not_implemented' },
      },
    });

    const res = await GET(new NextRequest('http://localhost/api/content/capabilities'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.wechat).toEqual({ enabled: true });
    expect(json.data.zhihu).toEqual({ enabled: false, reason: 'generator_not_implemented' });
    expect(getGenerationCapabilities).toHaveBeenCalledTimes(1);
  });

  it('falls back to the conservative snapshot when ContentOS is unreachable', async () => {
    getGenerationCapabilities.mockResolvedValue({
      schemaVersion: 1,
      platforms: {
        wechat: { enabled: true },
        weibo: { enabled: true },
        xiaohongshu: { enabled: true },
        douyin: { enabled: true },
      },
    });

    const res = await GET(new NextRequest('http://localhost/api/content/capabilities'));
    const json = await res.json();

    expect(res.status).toBe(200);
    // 回落快照必须包含全部已实现平台，手工入口才能继续创建。
    expect(Object.keys(json.data)).toEqual(
      expect.arrayContaining(['wechat', 'weibo', 'xiaohongshu', 'douyin']),
    );
  });
});
