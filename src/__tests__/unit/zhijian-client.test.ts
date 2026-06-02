import { beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyRequest } from '@/lib/proxy/zhijian-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('zhijian client proxyRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replaces :id placeholders with the project id in the upstream URL', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });

    await proxyRequest({
      projectId: 'proj-123',
      service: 'content',
      path: '/api/projects/:id/summary',
      accessToken: 'token-123',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4002/api/projects/proj-123/summary',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'X-ContentOS-Project-Id': 'proj-123',
        }),
      }),
    );
  });

  it('sends a JSON body when one is provided', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ published: true }),
    });

    await proxyRequest({
      projectId: 'proj-456',
      service: 'content',
      path: '/api/publish/:id',
      method: 'POST',
      body: { channel: 'wechat' },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:4002/api/publish/proj-456',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ channel: 'wechat' }),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-ContentOS-Project-Id': 'proj-456',
        }),
      }),
    );
  });
});
