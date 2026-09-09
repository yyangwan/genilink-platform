import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGenerationCapabilities,
  getCachedCapabilities,
  isPlatformSupported,
  resetCapabilityCache,
} from '@/lib/content/capabilities';
import { FALLBACK_CAPABILITIES } from '@/contracts/content-platform-capabilities-v1';
import capabilitiesFixture from '../../../contracts/fixtures/capabilities-valid.json';

describe('getGenerationCapabilities', () => {
  beforeEach(() => {
    resetCapabilityCache();
    vi.stubEnv('CONTENT_SERVICE_URL', 'http://contentos.test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetCapabilityCache();
  });

  it('fetches and caches the capability document for 60 seconds', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        return new Response(JSON.stringify(capabilitiesFixture), { status: 200 });
      }),
    );

    const first = await getGenerationCapabilities();
    const second = await getGenerationCapabilities();
    expect(calls).toBe(1);
    expect(first).toEqual(capabilitiesFixture);
    expect(second).toEqual(first);
    expect(getCachedCapabilities()).not.toBeNull();
  });

  it('falls back to the compile-time snapshot when ContentOS is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 503 })));
    const caps = await getGenerationCapabilities();
    expect(caps).toEqual(FALLBACK_CAPABILITIES);
  });

  it('falls back when the response fails schema validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ schemaVersion: 2, platforms: {} }), { status: 200 })),
    );
    const caps = await getGenerationCapabilities();
    expect(caps).toEqual(FALLBACK_CAPABILITIES);
  });

  it('isPlatformSupported reflects enabled flags only', () => {
    expect(isPlatformSupported(FALLBACK_CAPABILITIES, 'wechat')).toBe(true);
    expect(isPlatformSupported(FALLBACK_CAPABILITIES, 'zhihu')).toBe(false);
    expect(isPlatformSupported(FALLBACK_CAPABILITIES, 'toutiao')).toBe(false);
  });
});
