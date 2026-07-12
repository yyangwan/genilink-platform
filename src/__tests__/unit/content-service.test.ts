import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockProxyRequest = vi.fn();
const mockProxyStreamRequest = vi.fn();

vi.mock('@/lib/proxy/zhijian-client', () => ({
  proxyRequest: (...args: unknown[]) => mockProxyRequest(...args),
  proxyStreamRequest: (...args: unknown[]) => mockProxyStreamRequest(...args),
}));

import {
  listContents,
  createContent,
  getContent,
  updateContent,
  deleteContent,
  generateContent,
  generateGenieContent,
  getCalendarEvents,
  publishContent,
  publishToPlatform,
  getPublishStatus,
} from '@/lib/content/service';

describe('content service', () => {
  const ctx = { projectId: 'proj-1', serviceToken: 'dynamic-jwt' };

  const baseArgs = {
    service: 'content' as const,
    accessToken: 'dynamic-jwt',
    projectId: 'proj-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listContents calls proxyRequest with GET', async () => {
    mockProxyRequest.mockResolvedValue({ items: [] });
    await listContents(ctx);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/content?projectId=proj-1',
      timeoutMs: 30_000,
    });
  });

  it('listContents forwards list filters and canonical projectId', async () => {
    mockProxyRequest.mockResolvedValue({ items: [] });
    const params = new URLSearchParams({
      projectId: 'tampered-project',
      unscheduled: 'true',
      status: 'draft',
    });

    await listContents(ctx, params);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/content?projectId=proj-1&unscheduled=true&status=draft',
      timeoutMs: 30_000,
    });
  });

  it('createContent calls proxyRequest with POST and body', async () => {
    mockProxyRequest.mockResolvedValue({ id: 'c1' });
    const body = { title: 'Hello' };
    await createContent(ctx, body);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/content',
      method: 'POST',
      body,
      timeoutMs: 30_000,
    });
  });

  it('getContent calls proxyRequest with content ID path', async () => {
    mockProxyRequest.mockResolvedValue({ id: 'c1', title: 'Test' });
    await getContent(ctx, 'c1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/content/c1',
      timeoutMs: 30_000,
    });
  });

  it('updateContent calls proxyRequest with PUT and body', async () => {
    mockProxyRequest.mockResolvedValue({ id: 'c1', updated: true });
    const body = { title: 'Updated' };
    await updateContent(ctx, 'c1', body);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/content/c1',
      method: 'PUT',
      body,
      timeoutMs: 30_000,
    });
  });

  it('deleteContent calls proxyRequest with DELETE', async () => {
    mockProxyRequest.mockResolvedValue(undefined);
    await deleteContent(ctx, 'c1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/content/c1',
      method: 'DELETE',
      timeoutMs: 30_000,
    });
  });

  it('generateContent calls proxyStreamRequest with POST and body', async () => {
    mockProxyStreamRequest.mockResolvedValue(new Response('stream'));
    const body = { prompt: 'Write about AI' };
    await generateContent(ctx, 'c1', body);

    expect(mockProxyStreamRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/generate',
      method: 'POST',
      body: { contentPieceId: 'c1', prompt: 'Write about AI', platform: 'wechat' },
      timeoutMs: 180_000,
    });
  });

  it('generateContent generates every selected platform', async () => {
    mockProxyStreamRequest.mockImplementation(() => Promise.resolve(new Response('stream')));
    const res = await generateContent(ctx, 'c1', { platforms: ['xiaohongshu', 'wechat'] });

    expect(mockProxyStreamRequest).toHaveBeenCalledTimes(2);
    expect(mockProxyStreamRequest).toHaveBeenNthCalledWith(1, {
      ...baseArgs,
      path: '/api/generate',
      method: 'POST',
      body: { contentPieceId: 'c1', platforms: ['xiaohongshu', 'wechat'], platform: 'xiaohongshu' },
      timeoutMs: 180_000,
    });
    expect(mockProxyStreamRequest).toHaveBeenNthCalledWith(2, {
      ...baseArgs,
      path: '/api/generate',
      method: 'POST',
      body: { contentPieceId: 'c1', platforms: ['xiaohongshu', 'wechat'], platform: 'wechat' },
      timeoutMs: 180_000,
    });
    await expect(res.json()).resolves.toEqual({ ok: true, platforms: ['xiaohongshu', 'wechat'] });
  });

  it('generateContent preserves the selected platform', async () => {
    mockProxyStreamRequest.mockResolvedValue(new Response('stream'));
    await generateContent(ctx, 'c1', { platforms: ['zhihu'], topic: 'AI visibility' });

    expect(mockProxyStreamRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/generate',
      method: 'POST',
      body: { contentPieceId: 'c1', platforms: ['zhihu'], topic: 'AI visibility', platform: 'zhihu' },
      timeoutMs: 180_000,
    });
  });

  it('publishContent calls proxyRequest with POST and body', async () => {
    mockProxyRequest.mockResolvedValue({ published: true });
    const body = { channel: 'wechat' };
    await publishContent(ctx, 'c1', body);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/publish/c1',
      method: 'POST',
      body,
      timeoutMs: 30_000,
    });
  });

  it('publishToPlatform calls proxyRequest with POST and body', async () => {
    mockProxyRequest.mockResolvedValue({ status: 'published' });
    const body = { platform: 'wechat', content: 'Ready to publish' };
    await publishToPlatform(ctx, 'pc1', body);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/publish/pc1',
      method: 'POST',
      body,
      timeoutMs: 180_000,
    });
  });

  it('getPublishStatus calls proxyRequest with GET', async () => {
    mockProxyRequest.mockResolvedValue({ status: 'published' });
    await getPublishStatus(ctx, 'pc1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/publish/pc1',
      timeoutMs: 30_000,
    });
  });

  it('getCalendarEvents forwards calendar query params and canonical projectId', async () => {
    mockProxyRequest.mockResolvedValue([]);
    const params = new URLSearchParams({
      projectId: 'tampered-project',
      start: '2026-07-01',
      end: '2026-07-31',
      status: 'scheduled',
    });

    await getCalendarEvents(ctx, params);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/calendar/events?projectId=proj-1&start=2026-07-01&end=2026-07-31&status=scheduled',
      timeoutMs: 30_000,
    });
  });

  it('getCalendarEvents defaults to the current month when range is missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-03T12:00:00Z'));
    mockProxyRequest.mockResolvedValue([]);

    await getCalendarEvents(ctx, new URLSearchParams({ projectId: 'proj-1' }));

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/calendar/events?projectId=proj-1&start=2026-07-01&end=2026-07-31',
      timeoutMs: 30_000,
    });
    vi.useRealTimers();
  });

  it('generateGenieContent uses JSON proxyRequest instead of streaming proxy', async () => {
    mockProxyRequest.mockResolvedValue({ success: true });
    await generateGenieContent(ctx, { topic: 'AI' });

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      path: '/api/genie/generate',
      method: 'POST',
      body: { topic: 'AI' },
      timeoutMs: 180_000,
    });
    expect(mockProxyStreamRequest).not.toHaveBeenCalled();
  });
});
