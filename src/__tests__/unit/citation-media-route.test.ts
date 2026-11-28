import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { GET } from '@/app/api/integration/intelligence/media/route';

vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn() }));

const sample = 'a'.repeat(32);
const snapshot = 'b'.repeat(32);
const request = (media = '1') => new NextRequest(`http://localhost/api/integration/intelligence/media?projectId=p1&auditId=4&sampleId=${sample}&snapshotId=${snapshot}&ordinal=2&mediaOrdinal=${media}`);

describe('citation media preview proxy', () => {
  const fetcher = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('fetch', fetcher);
    vi.mocked(resolveGuard).mockResolvedValue({
      ok: true,
      ctx: { upstreamUrl: (path: string) => `https://analysis.test${path}`, headers: { Authorization: 'Bearer scoped' } },
    } as unknown as Awaited<ReturnType<typeof resolveGuard>>);
  });

  it('requires the source entitlement before reading any preview', async () => {
    vi.mocked(resolveGuard).mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) });
    expect((await GET(request())).status).toBe(403);
    expect(resolveGuard).toHaveBeenCalledWith(expect.anything(), { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks the citation scope and preserves the verified preview MIME', async () => {
    fetcher.mockResolvedValue(new Response('webp', { headers: { 'Content-Type': 'image/webp', 'Content-Length': '4' } }));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.text()).toBe('webp');
    expect(fetcher).toHaveBeenCalledWith(`https://analysis.test/api/intelligence/audits/4/capture/samples/${sample}/sources/2/media/1?snapshot_id=${snapshot}`, expect.objectContaining({ redirect: 'error' }));
  });

  it('rejects invalid ordinals and an HTML response', async () => {
    expect((await GET(request('25'))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(new Response('<html>', { headers: { 'Content-Type': 'text/html', 'Content-Length': '6' } }));
    expect((await GET(request())).status).toBe(502);
  });
});
