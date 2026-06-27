import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proxyStreamRequest } from '@/lib/proxy/zhijian-client';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('proxyStreamRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return SSE stream on success', async () => {
    const mockBody = new ReadableStream();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      body: mockBody,
    });

    const res = await proxyStreamRequest({
      projectId: 'proj-ok',
      service: 'content',
      path: '/api/contents/123/generate',
      method: 'POST',
      body: { prompt: 'write about AI' },
      accessToken: 'test-token',
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    const request = mockFetch.mock.calls[0][0] as Request;
    expect(request.url).toBe('http://127.0.0.1:4003/api/contents/123/generate');
    expect(request.method).toBe('POST');
    expect(request.headers.get('authorization')).toBe('Bearer test-token');
    expect(request.headers.get('accept')).toBe('text/event-stream');
    expect(request.headers.get('x-genilink-project-id')).toBe('proj-ok');
  });

  it('should return 401 Response on AUTH_EXPIRED', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const res = await proxyStreamRequest({
      projectId: 'proj-401',
      service: 'content',
      path: '/api/contents/123/generate',
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('AUTH_EXPIRED');
  });

  it('should return 504 Response on timeout', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortError);

    const res = await proxyStreamRequest({
      projectId: 'proj-timeout',
      service: 'content',
      path: '/api/contents/123/generate',
    });

    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toBe('TIMEOUT');
  });
});
