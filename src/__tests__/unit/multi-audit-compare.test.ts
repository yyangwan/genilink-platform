import { describe, expect, it, vi } from 'vitest';
import { GET as history } from '@/app/api/integration/trends/audits-history/route';
import { GET as scores } from '@/app/api/integration/trends/route';
import { GET as alias } from '@/app/api/integration/trends/history/route';
import { POST as compare } from '@/app/api/integration/compare/route';
import { POST as multi } from '@/app/api/integration/strategic/compare-audits/route';
import { GET as authority } from '@/app/api/integration/strategic/source-authority/route';
import { GET as positioning } from '@/app/api/integration/strategic/competitor-positioning/route';
import { GET as structure } from '@/app/api/integration/strategic/structure-evolution/route';
import { GET as insights } from '@/app/api/integration/content-intelligence/route';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
describe('retired legacy analysis APIs', () => {
  it.each([history, scores, alias, compare, multi, authority, positioning, structure, insights])('returns explicit retirement without upstream work or quota', async handler => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    try {
      const response = await handler(); expect(response.status).toBe(410);
      expect(await response.json()).toMatchObject({ error: 'VISIBILITY_ENDPOINT_RETIRED', replacement: expect.stringMatching(/^\//) });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(resolveGuard).not.toHaveBeenCalled(); expect(fetchUpstream).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
