import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  publishContent,
  scoreContent,
} from '@/lib/content/service';

describe('content service', () => {
  const ctx = { projectId: 'proj-1', externalId: 'ext-123', serviceToken: 'dynamic-jwt' };

  const baseArgs = {
    service: 'content' as const,
    accessToken: 'dynamic-jwt',
    externalId: 'ext-123',
    timeoutMs: 30_000,
  };

  const streamArgs = {
    ...baseArgs,
    timeoutMs: 180_000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listContents calls proxyRequest with GET and project contents path', async () => {
    mockProxyRequest.mockResolvedValue({ items: [] });
    await listContents(ctx);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/projects/:id/contents',
    });
  });

  it('createContent calls proxyRequest with POST and body', async () => {
    mockProxyRequest.mockResolvedValue({ id: 'c1' });
    const body = { title: 'Hello' };
    await createContent(ctx, body);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/projects/:id/contents',
      method: 'POST',
      body,
    });
  });

  it('getContent calls proxyRequest with content ID path', async () => {
    mockProxyRequest.mockResolvedValue({ id: 'c1', title: 'Test' });
    await getContent(ctx, 'c1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1',
    });
  });

  it('updateContent calls proxyRequest with PUT and body', async () => {
    mockProxyRequest.mockResolvedValue({ id: 'c1', updated: true });
    const body = { title: 'Updated' };
    await updateContent(ctx, 'c1', body);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1',
      method: 'PUT',
      body,
    });
  });

  it('deleteContent calls proxyRequest with DELETE', async () => {
    mockProxyRequest.mockResolvedValue(undefined);
    await deleteContent(ctx, 'c1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1',
      method: 'DELETE',
    });
  });

  it('generateContent calls proxyStreamRequest with POST and body', async () => {
    mockProxyStreamRequest.mockResolvedValue(new Response('stream'));
    const body = { prompt: 'Write about AI' };
    await generateContent(ctx, 'c1', body);

    expect(mockProxyStreamRequest).toHaveBeenCalledWith({
      ...streamArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1/generate',
      method: 'POST',
      body,
    });
  });

  it('publishContent calls proxyRequest with POST and body', async () => {
    mockProxyRequest.mockResolvedValue({ published: true });
    const body = { channel: 'wechat' };
    await publishContent(ctx, 'c1', body);

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1/publish',
      method: 'POST',
      body,
    });
  });

  it('scoreContent calls proxyRequest with POST and no body', async () => {
    mockProxyRequest.mockResolvedValue({ score: 85 });
    await scoreContent(ctx, 'c1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1/score',
      method: 'POST',
    });
  });
});
