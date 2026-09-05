import { describe, expect, it } from 'vitest';
import { handleProxyError } from '@/lib/proxy/proxy-errors';

describe('handleProxyError', () => {
  it('returns a publishing-specific customer message for platform failures', async () => {
    const response = handleProxyError(new Error('PLATFORM_PUBLISH_FAILED'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: '发布失败，请检查文章内容、封面图片及平台权限后重试。',
    });
  });
});
