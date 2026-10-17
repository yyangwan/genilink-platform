import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() } } }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { GET } from '@/app/api/dashboard/visibility/route';
const req = () => new NextRequest('http://localhost/api/dashboard/visibility?projectId=p1');
const result = { schema: 'citation-dashboard-1', project_id: 'p1', enabled: true, processing: false, latest_audit: { id: '12', platforms: ['qwen'] },
  report: { schema: 'citation-report-1', project_id: 'p1', audit_id: '12', status: 'ready', snapshot_current: true, entities: [{ name: 'newbrand' }], diagnoses: ['private'], evidence: ['quote'], sources: ['article'], platforms: [{ platform: 'qwen', samples: 3, metrics: ['detail'] }] } };
function guard(level = 'full', role = 'owner') { return { ok: true, ctx: { projectId: 'p1', role, billing: { capabilities: { auditReport: level, contentInsights: level } } } } as Awaited<ReturnType<typeof resolveGuard>>; }
describe('latest-audit visibility overview proxy', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(resolveGuard).mockResolvedValue(guard()); vi.mocked(fetchUpstream).mockResolvedValue({ data: result }); vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0); });
  it('only reads the verified project dashboard, without strategic or history synthesis', async () => {
    const response = await GET(req()); expect(response.status).toBe(200);
    expect(fetchUpstream).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ projectId: 'p1' }), '/api/intelligence/projects/p1/dashboard', expect.anything());
    expect(response.headers.get('Cache-Control')).toBe('no-store'); expect((await response.json()).can_capture).toBe(true);
  });
  it('redacts basic detail consistently with the report and disables capture', async () => {
    vi.mocked(resolveGuard).mockResolvedValue(guard('basic'));
    const data = await (await GET(req())).json();
    for (const key of ['entities', 'evidence', 'sources', 'diagnoses']) expect(data.report[key]).toBeUndefined();
    expect(data.report.platforms[0].metrics).toEqual([]); expect(data.can_capture).toBe(false);
  });
  it('preserves pending context and viewer restrictions', async () => {
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    expect(await (await GET(req())).json()).toMatchObject({ context_sync_pending: true, can_capture: false, report: { snapshot_current: false, status: 'stale' } });
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0); vi.mocked(resolveGuard).mockResolvedValue(guard('full', 'viewer'));
    expect((await (await GET(req())).json()).can_capture).toBe(false);
  });
  it('rejects mixed project/audit payloads and preserves upstream errors and denied access', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...result, report: { ...result.report, audit_id: '11' } } });
    expect((await GET(req())).status).toBe(502);
    vi.mocked(fetchUpstream).mockResolvedValue({ response: NextResponse.json({}, { status: 503 }) }); expect((await GET(req())).status).toBe(503);
    vi.mocked(resolveGuard).mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) }); expect((await GET(req())).status).toBe(403);
  });
  it('keeps an empty or disabled project explicit rather than filling in zero scores', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...result, enabled: false, latest_audit: null, report: null } });
    const data = await (await GET(req())).json(); expect(data.report).toBeNull(); expect(data.can_capture).toBe(false); expect(data.overallScore).toBeUndefined();
  });
});
