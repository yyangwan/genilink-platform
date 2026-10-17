import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() } } }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { GET } from '@/app/api/integration/measurement-history/route';

const id = 'a'.repeat(32);
const result = { schema: 'citation-measurement-history-1', project_id: 'p1', enabled: true, selected_cohort_id: id, cohorts: [{ id }], results: [{ id: 'result', cohort_id: id, version: 'paired-source-presence-2', snapshot_current: true, platforms: [{ platform: 'qwen', metrics: [{ difference: 0.2, interval95: [0.1, 0.3], baseline: { numerator: 1, denominator: 3 } }] }] }] };
const req = (cohortId = id) => new NextRequest(`http://localhost/api/integration/measurement-history?projectId=p1&cohortId=${cohortId}&history_days=36500&runId=forged`);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'p1', billing: { capabilities: { trendHistoryDays: 365 } } } } as Awaited<ReturnType<typeof resolveGuard>>);
  vi.mocked(fetchUpstream).mockResolvedValue({ data: result });
  vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0);
});
describe('saved measurement history gateway', () => {
  it('uses full insight entitlement and server history range, ignoring caller run and range', async () => {
    const response = await GET(req()); expect(response.status).toBe(200);
    expect(resolveGuard).toHaveBeenCalledWith(expect.anything(), { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/projects/p1/measurement-history?history_days=365&cohort_id=${id}`, expect.anything());
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect((await response.json()).history_days).toBe(365);
  });
  it.each([true, false])('removes current change estimates for stale or pending context (%s)', async pending => {
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(pending ? 1 : 0);
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...result, results: result.results.map(item => ({ ...item, snapshot_current: !pending ? false : true })) } });
    const data = await (await GET(req())).json();
    expect(data.results[0].snapshot_current).toBe(false);
    expect(data.results[0].platforms[0].metrics[0]).toMatchObject({ difference: null, interval95: null, baseline: { numerator: 1, denominator: 3 } });
  });
  it('rejects invalid selectors and mixed project/cohort/version responses', async () => {
    expect((await GET(req('-1'))).status).toBe(400); expect(resolveGuard).not.toHaveBeenCalled();
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...result, project_id: 'p2' } }); expect((await GET(req())).status).toBe(502);
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...result, selected_cohort_id: 'b'.repeat(32) } }); expect((await GET(req())).status).toBe(502);
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...result, results: [{ ...result.results[0], version: 'old' }] } }); expect((await GET(req())).status).toBe(502);
  });
  it('preserves denied access and upstream failures', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ response: NextResponse.json({}, { status: 409 }) }); expect((await GET(req())).status).toBe(409);
    vi.mocked(resolveGuard).mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) }); expect((await GET(req())).status).toBe(403);
  });
});
