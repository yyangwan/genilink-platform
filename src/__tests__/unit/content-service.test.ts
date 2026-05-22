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
  const originalToken = process.env.SERVICE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERVICE_TOKEN = 'test-service-token';
  });

  afterEach(() => {
    process.env.SERVICE_TOKEN = originalToken;
  });

  const baseArgs = {
    service: 'content' as const,
    accessToken: 'test-service-token',
  };

  it('listContents calls proxyRequest with GET and project contents path', async () => {
    mockProxyRequest.mockResolvedValue({ items: [] });
    await listContents('proj-1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/projects/:id/contents',
    });
  });

  it('createContent calls proxyRequest with POST and body', async () => {
    mockProxyRequest.mockResolvedValue({ id: 'c1' });
    const body = { title: 'Hello' };
    await createContent('proj-1', body);

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
    await getContent('proj-1', 'c1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1',
    });
  });

  it('updateContent calls proxyRequest with PUT and body', async () => {
    mockProxyRequest.mockResolvedValue({ id: 'c1', updated: true });
    const body = { title: 'Updated' };
    await updateContent('proj-1', 'c1', body);

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
    await deleteContent('proj-1', 'c1');

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
    await generateContent('proj-1', 'c1', body);

    expect(mockProxyStreamRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1/generate',
      method: 'POST',
      body,
    });
  });

  it('publishContent calls proxyRequest with POST and body', async () => {
    mockProxyRequest.mockResolvedValue({ published: true });
    const body = { channel: 'wechat' };
    await publishContent('proj-1', 'c1', body);

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
    await scoreContent('proj-1', 'c1');

    expect(mockProxyRequest).toHaveBeenCalledWith({
      ...baseArgs,
      projectId: 'proj-1',
      path: '/api/contents/c1/score',
      method: 'POST',
    });
  });
});
