import { describe, expect, it, vi } from 'vitest';
import { GET, PATCH, DELETE } from '@/app/api/integration/suggestions/[id]/route';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
describe('retired suggestion-to-content bridge', () => {
  it.each([GET, PATCH, DELETE])('returns retirement without upstream work or generation', async handler => {
    const response = await handler(); expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: 'VISIBILITY_ENDPOINT_RETIRED', replacement: '/content' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(resolveGuard).not.toHaveBeenCalled(); expect(fetchUpstream).not.toHaveBeenCalled();
  });
});
