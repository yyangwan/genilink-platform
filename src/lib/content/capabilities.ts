/**
 * 平台生成能力（设计 §10.9）：读取 ContentOS 能力接口，缓存 60 秒。
 * 能力接口不可用时使用编译期保守快照（仅四个已实现平台）。
 */

import type { PlatformCapabilitiesV1 } from '@/contracts/content-platform-capabilities-v1';
import { FALLBACK_CAPABILITIES } from '@/contracts/content-platform-capabilities-v1';
import { validateCapabilitiesV1 } from '@/lib/contracts/validate';

const CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3_000;

const CONTENT_URL = () => process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003';

interface CapabilityCacheEntry {
  value: PlatformCapabilitiesV1;
  fetchedAt: number;
}

let cache: CapabilityCacheEntry | null = null;

export function getCachedCapabilities(): PlatformCapabilitiesV1 | null {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null;
  return cache.value;
}

export function isPlatformSupported(
  caps: PlatformCapabilitiesV1,
  platform: string,
): boolean {
  return caps.platforms[platform]?.enabled === true;
}

async function fetchCapabilitiesUncached(): Promise<PlatformCapabilitiesV1 | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${CONTENT_URL()}/api/capabilities/content-generation`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (!validateCapabilitiesV1(body).ok) return null;
    return body as PlatformCapabilitiesV1;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getGenerationCapabilities(): Promise<PlatformCapabilitiesV1> {
  const cached = getCachedCapabilities();
  if (cached) return cached;

  const fresh = await fetchCapabilitiesUncached();
  if (fresh) {
    cache = { value: fresh, fetchedAt: Date.now() };
    return fresh;
  }
  return FALLBACK_CAPABILITIES;
}

/** 测试用：清空缓存。 */
export function resetCapabilityCache(): void {
  cache = null;
}
