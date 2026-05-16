import { prisma } from '@/lib/db';

// Simple in-memory LRU cache for cuid↔integer mapping
const cache = new Map<string, { externalId: string; expires: number }>();
const MAX_CACHE = 500;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(projectId: string, service: string): string {
  return `${projectId}:${service}`;
}

function evictStale(): void {
  const now = Date.now();
  for (const [key, val] of cache) {
    if (val.expires < now) cache.delete(key);
  }
}

export async function getExternalId(projectId: string, service: string): Promise<string | null> {
  const key = getCacheKey(projectId, service);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.externalId;

  const mapping = await prisma.externalResourceMapping.findUnique({
    where: { projectId_service: { projectId, service } },
  });
  if (!mapping) return null;

  // Evict stale entries if at capacity
  if (cache.size >= MAX_CACHE) evictStale();
  if (cache.size >= MAX_CACHE) {
    // Evict oldest entry
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }

  cache.set(key, { externalId: mapping.externalId, expires: Date.now() + TTL_MS });
  return mapping.externalId;
}

export function evictCache(projectId: string, service?: string): void {
  if (service) {
    cache.delete(getCacheKey(projectId, service));
  } else {
    for (const key of cache.keys()) {
      if (key.startsWith(`${projectId}:`)) cache.delete(key);
    }
  }
}

export interface ProxyRequestOptions {
  projectId: string;
  service: 'visibility' | 'content';
  path: string;
  accessToken?: string;
  body?: unknown;
  method?: string;
}

const SERVICE_URLS: Record<string, string> = {
  visibility: process.env.VISIBILITY_SERVICE_URL || 'http://localhost:8000',
  content: process.env.CONTENT_SERVICE_URL || 'http://localhost:3001',
};

const TIMEOUT_MS = 5000;

export async function proxyRequest<T = unknown>(opts: ProxyRequestOptions): Promise<T> {
  const externalId = await getExternalId(opts.projectId, opts.service);
  if (!externalId) {
    throw new Error(`No mapping found for project ${opts.projectId} → ${opts.service}`);
  }

  const baseUrl = SERVICE_URLS[opts.service];
  const url = `${baseUrl}${opts.path}`.replace(':id', externalId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (opts.accessToken) {
      headers['Authorization'] = `Bearer ${opts.accessToken}`;
    }

    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.status === 401) {
      throw new Error('AUTH_EXPIRED');
    }
    if (res.status === 403) {
      throw new Error('ACCESS_DENIED');
    }
    if (res.status === 404) {
      evictCache(opts.projectId, opts.service);
      throw new Error('NOT_FOUND');
    }
    if (!res.ok) {
      throw new Error(`UPSTREAM_ERROR_${res.status}`);
    }

    return (await res.json()) as T;
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      throw new Error('TIMEOUT');
    }
    throw err;
  }
}
