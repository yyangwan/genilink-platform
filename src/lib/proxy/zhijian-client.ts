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

/**
 * Ensure the visibility service project exists and is synced with the latest
 * product info. Creates the project if needed, otherwise PATCHes to update
 * product_category.
 */
export async function syncProjectToVisibility(
  projectId: string,
  externalId: string,
): Promise<number> {
  const serviceToken = process.env.SERVICE_TOKEN;
  const baseUrl = SERVICE_URLS['visibility'];
  const parsed = parseInt(externalId, 10);
  const alreadyInteger = !isNaN(parsed) && String(parsed) === externalId;

  // Look up local project for product info
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const name = project?.name || `Project-${projectId.slice(-6)}`;
  const industry = project?.industry || undefined;
  const product_category = [project?.productName, ...(project?.productKeywords || [])].filter(Boolean).join('、') || undefined;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

  if (alreadyInteger) {
    // Project exists — PATCH to update product info
    try {
      await fetch(`${baseUrl}/api/projects/${parsed}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ name, industry, product_category }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Non-critical — continue even if sync fails
    }
    return parsed;
  }

  // externalId is a nanoid — need to create project
  if (!serviceToken) {
    throw new Error('SERVICE_TOKEN not configured — cannot auto-create visibility project');
  }

  const res = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, industry, product_category }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to create project on visibility service: ${res.status}`);
  }

  const data = await res.json();
  const newId = String(data.id);

  await prisma.externalResourceMapping.update({
    where: { projectId_service: { projectId, service: 'visibility' } },
    data: { externalId: newId },
  });
  evictCache(projectId, 'visibility');

  return data.id as number;
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

// ─── Brand Sync ─────────────────────────────────────────────────────

interface BrandSyncPayload {
  name: string;
  aliases: string[];
  isCompetitor: boolean;
  logo?: string | null;
  website?: string | null;
  description?: string | null;
}

interface BrandSyncResult {
  synced: 'full' | 'partial' | 'failed';
  remoteIds: Record<string, string>;
  errors: string[];
}

/**
 * Sync brand to 智見 (visibility service). Awaited by the route handler.
 * For each project in the workspace, creates/updates the brand in 智見.
 * Returns remote IDs for storage in Brand.remoteIds.
 */
export async function syncBrandToVisibility(
  brand: { id: string; name: string; aliases: string[]; isCompetitor: boolean; logo?: string | null; website?: string | null; description?: string | null; workspaceId: string },
  existingRemoteIds: Record<string, string> | null,
): Promise<BrandSyncResult> {
  const errors: string[] = [];
  const remoteIds: Record<string, string> = { ...(existingRemoteIds ?? {}) };
  const serviceToken = process.env.SERVICE_TOKEN;
  const baseUrl = SERVICE_URLS['visibility'];

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

  // Get all projects in the workspace to project brands into each
  const projects = await prisma.project.findMany({
    where: { workspaceId: brand.workspaceId },
    include: { externalMappings: { where: { service: 'visibility' } } },
  });

  for (const project of projects) {
    const mapping = project.externalMappings[0];
    if (!mapping) continue; // project not linked to visibility yet

    const visibilityProjectId = mapping.externalId;
    const payload: Record<string, unknown> = {
      name: brand.name,
      aliases: brand.aliases,
      is_competitor: brand.isCompetitor, // 智見 uses snake_case
    };

    try {
      const remoteBrandId = remoteIds[visibilityProjectId];
      if (remoteBrandId) {
        // Update existing remote brand
        const res = await fetchWithRetry(
          `${baseUrl}/api/projects/${visibilityProjectId}/brands/${remoteBrandId}`,
          { method: 'PATCH', headers, body: JSON.stringify(payload) },
        );
        if (!res.ok) {
          errors.push(`visibility project ${visibilityProjectId}: PATCH ${res.status}`);
        }
      } else {
        // Create remote brand
        const res = await fetchWithRetry(
          `${baseUrl}/api/projects/${visibilityProjectId}/brands`,
          { method: 'POST', headers, body: JSON.stringify(payload) },
        );
        if (res.ok) {
          const data = await res.json();
          remoteIds[visibilityProjectId] = String(data.id);
        } else {
          errors.push(`visibility project ${visibilityProjectId}: POST ${res.status}`);
        }
      }
    } catch (err) {
      errors.push(`visibility project ${visibilityProjectId}: ${(err as Error).message}`);
    }
  }

  return {
    synced: errors.length === 0 ? 'full' : Object.keys(remoteIds).length > 0 ? 'partial' : 'failed',
    remoteIds,
    errors,
  };
}

/**
 * Sync brand delete to 智見. Fire-and-forget with retries.
 */
export async function syncBrandDeleteToVisibility(
  brand: { id: string; workspaceId: string },
  remoteIds: Record<string, string> | null,
): Promise<void> {
  if (!remoteIds) return;

  const serviceToken = process.env.SERVICE_TOKEN;
  const baseUrl = SERVICE_URLS['visibility'];
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

  for (const [projectId, brandId] of Object.entries(remoteIds)) {
    try {
      await fetchWithRetry(
        `${baseUrl}/api/projects/${projectId}/brands/${brandId}`,
        { method: 'DELETE', headers },
      );
    } catch (err) {
      console.error(`[brand-sync] DELETE failed for brand ${brand.id} in visibility project ${projectId}:`, (err as Error).message);
    }
  }
}

/** Fetch with up to 2 retries and 1s backoff */
async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}

export interface ProxyRequestOptions {
  projectId: string;
  service: 'visibility' | 'content';
  path: string;
  accessToken?: string;
  body?: unknown;
  method?: string;
  /** Pre-resolved external ID — skips getExternalId() lookup when provided */
  externalId?: string;
  /** Override default timeout in ms */
  timeoutMs?: number;
}

const SERVICE_URLS: Record<string, string> = {
  visibility: process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000',
  content: process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4002',
};

const TIMEOUT_MS = 120_000;

export async function proxyRequest<T = unknown>(opts: ProxyRequestOptions): Promise<T> {
  const externalId = opts.externalId ?? await getExternalId(opts.projectId, opts.service);
  if (!externalId) {
    throw new Error(`No mapping found for project ${opts.projectId} → ${opts.service}`);
  }

  const baseUrl = SERVICE_URLS[opts.service];
  const url = `${baseUrl}${opts.path}`.replace(':id', externalId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (opts.accessToken) {
      headers['Authorization'] = `Bearer ${opts.accessToken}`;
    }
    if (externalId && opts.service === 'content') {
      headers['X-ContentOS-Project-Id'] = externalId;
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

/**
 * Stream proxy — resolves external ID, then pipes the upstream SSE response
 * through without buffering. Used for AI content generation endpoints.
 */
export async function proxyStreamRequest(opts: ProxyRequestOptions): Promise<Response> {
  const externalId = opts.externalId ?? await getExternalId(opts.projectId, opts.service);
  if (!externalId) {
    return new Response(
      JSON.stringify({ error: `No mapping found for project ${opts.projectId} → ${opts.service}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const baseUrl = SERVICE_URLS[opts.service];
  const url = `${baseUrl}${opts.path}`.replace(':id', externalId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (opts.accessToken) {
    headers['Authorization'] = `Bearer ${opts.accessToken}`;
  }
  if (externalId && opts.service === 'content') {
    headers['X-ContentOS-Project-Id'] = externalId;
  }

  try {
    const res = await fetch(url, {
      method: opts.method || 'POST',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.status === 401) {
      return new Response(JSON.stringify({ error: 'AUTH_EXPIRED' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    if (res.status === 403) {
      return new Response(JSON.stringify({ error: 'ACCESS_DENIED' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }
    if (res.status === 404) {
      evictCache(opts.projectId, opts.service);
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `UPSTREAM_ERROR_${res.status}` }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(res.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'TIMEOUT' }), { status: 504, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
