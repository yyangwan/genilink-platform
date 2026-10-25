import { afterEach, expect, it, vi } from 'vitest';
import { evidenceDraftReady } from '@/lib/content/evidence-capabilities';
afterEach(() => vi.unstubAllGlobals());
it('requires receiver v3, enabled generation, the exact channel and separate publication authority', async () => {
  const good = { schemaVersion: 3, enabled: true, generateDraft: { enabled: true, channels: ['wechat'] }, publicationAllowed: false };
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(good)));
  vi.stubGlobal('fetch', fetcher);
  expect(await evidenceDraftReady('test-token', 'wechat')).toBe(true);
  expect(await evidenceDraftReady('test-token', 'douyin')).toBe(false);
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ ...good, schemaVersion: 2 })));
  expect(await evidenceDraftReady('test-token', 'wechat')).toBe(false);
  fetcher.mockRejectedValueOnce(Error('offline'));
  expect(await evidenceDraftReady('test-token', 'wechat')).toBe(false);
});
