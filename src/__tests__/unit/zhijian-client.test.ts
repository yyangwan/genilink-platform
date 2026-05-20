import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getExternalId,
  evictCache,
  proxyRequest,
} from '@/lib/proxy/zhijian-client';
import { prisma } from '@/lib/db';

// Mock the db module
vi.mock('@/lib/db', () => ({
  prisma: {
    externalResourceMapping: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('getExternalId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level cache by re-importing won't work,
    // so we use evictCache to clear all entries between tests
    evictCache('all-projects');
  });

  it('should return externalId from cache on cache hit', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-abc123',
      projectId: 'proj-1',
      service: 'visibility',
    });

    // First call populates the cache
    const result1 = await getExternalId('proj-1', 'visibility');
    expect(result1).toBe('ext-abc123');
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledTimes(1);

    // Second call should hit cache — DB not called again
    const result2 = await getExternalId('proj-1', 'visibility');
    expect(result2).toBe('ext-abc123');
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledTimes(1);
  });

  it('should query DB on cache miss and cache result', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-xyz789',
      projectId: 'proj-2',
      service: 'content',
    });

    const result = await getExternalId('proj-2', 'content');
    expect(result).toBe('ext-xyz789');
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledWith({
      where: {
        projectId_service: { projectId: 'proj-2', service: 'content' },
      },
    });
  });

  it('should return null when no mapping exists', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const result = await getExternalId('proj-nonexistent', 'visibility');
    expect(result).toBeNull();
  });

  it('should return null and not cache when DB returns null', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ externalId: 'ext-late' });

    const result1 = await getExternalId('proj-3', 'visibility');
    expect(result1).toBeNull();

    // Second call should hit DB again (null not cached)
    const result2 = await getExternalId('proj-3', 'visibility');
    expect(result2).toBe('ext-late');
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('evictCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should evict cache on evictCache call with specific service', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-to-evict',
    });

    // Populate cache
    await getExternalId('proj-evict', 'visibility');
    // Verify it's cached (DB called once)
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledTimes(1);

    // Evict specific service
    evictCache('proj-evict', 'visibility');

    // Next call should hit DB again
    await getExternalId('proj-evict', 'visibility');
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledTimes(2);
  });

  it('should evict all services for a project when service not specified', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-multi',
    });

    // Populate cache for both services
    await getExternalId('proj-multi', 'visibility');
    await getExternalId('proj-multi', 'content');
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledTimes(2);

    // Evict all for this project
    evictCache('proj-multi');

    // Both should miss cache now
    await getExternalId('proj-multi', 'visibility');
    await getExternalId('proj-multi', 'content');
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledTimes(4);
  });
});

describe('proxyRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should throw NOT_FOUND when mapping missing', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      proxyRequest({
        projectId: 'proj-none',
        service: 'visibility',
        path: '/api/projects/:id',
      })
    ).rejects.toThrow('No mapping found for project proj-none → visibility');
  });

  it('should throw AUTH_EXPIRED on 401', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-401',
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    });

    await expect(
      proxyRequest({
        projectId: 'proj-401',
        service: 'visibility',
        path: '/api/projects/:id',
        accessToken: 'expired-token',
      })
    ).rejects.toThrow('AUTH_EXPIRED');
  });

  it('should throw ACCESS_DENIED on 403', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-403',
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });

    await expect(
      proxyRequest({
        projectId: 'proj-403',
        service: 'content',
        path: '/api/projects/:id',
      })
    ).rejects.toThrow('ACCESS_DENIED');
  });

  it('should evict cache and throw NOT_FOUND on 404', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-404',
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });

    await expect(
      proxyRequest({
        projectId: 'proj-404',
        service: 'visibility',
        path: '/api/projects/:id',
      })
    ).rejects.toThrow('NOT_FOUND');

    // Verify cache was evicted — next call hits DB again
    await getExternalId('proj-404', 'visibility');
    expect(prisma.externalResourceMapping.findUnique).toHaveBeenCalledTimes(2);
  });

  it('should throw TIMEOUT on abort', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-slow',
    });

    const abortError = new DOMException('The operation was aborted', 'AbortError');
    mockFetch.mockRejectedValue(abortError);

    // Advance timers past the 5s timeout
    vi.advanceTimersByTime(6000);

    await expect(
      proxyRequest({
        projectId: 'proj-slow',
        service: 'visibility',
        path: '/api/projects/:id',
      })
    ).rejects.toThrow('TIMEOUT');
  });

  it('should replace :id placeholder with externalId in URL', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-replace',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: 'success' }),
    });

    await proxyRequest({
      projectId: 'proj-url',
      service: 'visibility',
      path: '/api/projects/:id/data',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/api/projects/ext-replace/data',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('should send POST with body when provided', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-post',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ created: true }),
    });

    const body = { name: 'test' };
    await proxyRequest({
      projectId: 'proj-post',
      service: 'content',
      path: '/api/projects/:id/items',
      method: 'POST',
      body,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3001/api/projects/ext-post/items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
      })
    );
  });

  it('should include Authorization header when accessToken provided', async () => {
    (prisma.externalResourceMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      externalId: 'ext-auth',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await proxyRequest({
      projectId: 'proj-auth',
      service: 'visibility',
      path: '/api/data',
      accessToken: 'my-jwt-token',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer my-jwt-token',
        }),
      })
    );
  });
});
