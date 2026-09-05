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

    const request = mockFetch.mock.calls[0][0] as Request;
    expect(request.url).toBe('http://127.0.0.1:4003/api/projects/proj-123/summary');
    expect(request.method).toBe('GET');
    expect(request.headers.get('authorization')).toBe('Bearer token-123');
    expect(request.headers.get('x-genilink-project-id')).toBe('proj-123');
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

    const request = mockFetch.mock.calls[0][0] as Request;
    expect(request.url).toBe('http://127.0.0.1:4003/api/publish/proj-456');
    expect(request.method).toBe('POST');
    expect(await request.text()).toBe(JSON.stringify({ channel: 'wechat' }));
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(request.headers.get('x-genilink-project-id')).toBe('proj-456');
  });

  it('distinguishes expired publishing-platform authorization from service auth failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({
        error: 'No access token. Please authenticate with the platform.',
        needsAuth: true,
        platform: 'wechat',
      }),
    });

    await expect(proxyRequest({
      projectId: 'proj-456',
      service: 'content',
      path: '/api/publish/content-1',
      method: 'POST',
    })).rejects.toThrow('PLATFORM_AUTH_REQUIRED');
  });

  it('distinguishes platform publishing failures from service connectivity failures', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({
        error: '微信公众号封面上传失败',
        code: 'PLATFORM_PUBLISH_FAILED',
        needsAuth: false,
      }),
    });

    await expect(proxyRequest({
      projectId: 'proj-456',
      service: 'content',
      path: '/api/publish/content-1',
      method: 'POST',
    })).rejects.toMatchObject({
      message: 'PLATFORM_PUBLISH_FAILED',
      upstreamMessage: '微信公众号封面上传失败',
    });
  });
});
