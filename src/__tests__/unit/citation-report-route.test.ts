import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() } } }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { GET, POST } from '@/app/api/integration/reports/[id]/route';
import { GET as pdf } from '@/app/api/integration/reports/[id]/pdf/route';
const request = () => new NextRequest('http://localhost/api/integration/reports/12?projectId=p1');
const params = (id = '12') => ({ params: Promise.resolve({ id }) });
const report = { schema: 'citation-report-1', audit_id: '12', project_id: 'p1', status: 'ready', snapshot_current: true,
  entities: [{ id: 'brand', name: '未登记主体' }], diagnoses: ['secret'], evidence: ['quote'], sources: ['article'], responses: ['raw'],
  platforms: [{ platform: 'qwen', samples: 2, metrics: ['full detail'] }] };
function guard(level = 'full') { return { ok: true, ctx: { projectId: 'p1', billing: { capabilities: { auditReport: level } } } } as Awaited<ReturnType<typeof resolveGuard>>; }
describe('new immutable report proxy', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(resolveGuard).mockResolvedValue(guard()); vi.mocked(fetchUpstream).mockResolvedValue({ data: report }); vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0); });
  it('reads the scoped new report without legacy generation or raw query results', async () => {
    const response = await GET(request(), params());
    expect(response.status).toBe(200); expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(fetchUpstream).toHaveBeenCalledExactlyOnceWith(expect.anything(), '/api/intelligence/audits/12/report', expect.anything());
    expect(resolveGuard).toHaveBeenCalledWith(expect.anything(), { capability: 'auditReport' });
  });
  it('removes all detailed payloads at basic entitlement', async () => {
    vi.mocked(resolveGuard).mockResolvedValue(guard('basic'));
    const data = await (await GET(request(), params())).json();
    for (const field of ['entities', 'evidence', 'sources', 'responses', 'diagnoses']) expect(data[field]).toBeUndefined();
    expect(data.platforms[0].metrics).toEqual([]);
  });
  it('marks delivered-backend snapshots stale while Portal has pending configuration', async () => {
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    expect(await (await GET(request(), params())).json()).toMatchObject({ status: 'stale', snapshot_current: false, context_sync_pending: true });
  });
  it('rejects invalid and mismatched identifiers and preserves denied access', async () => {
    expect((await GET(request(), params('../1'))).status).toBe(400); expect(fetchUpstream).not.toHaveBeenCalled();
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...report, project_id: 'p2' } });
    expect((await GET(request(), params())).status).toBe(502);
    vi.mocked(resolveGuard).mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) });
    expect((await GET(request(), params())).status).toBe(403);
  });
  it('never invokes old generation or serves an old PDF', async () => {
    expect((await POST()).status).toBe(409); expect((await pdf()).status).toBe(405);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it('restricts attached comparisons to the exact report run and redacts basic/stale estimates', async () => {
    const attachment = { scope_run_id: 'a'.repeat(32), truncated: false, results: [{ id: 'm1', version: 'paired-source-presence-2', baseline_run_id: 'b'.repeat(32), followup_run_id: 'a'.repeat(32), snapshot_current: true, platforms: [{ platform: 'qwen', metrics: [{ difference: 0.2, interval95: [0.1, 0.3] }] }] }] };
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...report, run_id: 'a'.repeat(32), measurements: attachment } });
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    const data = await (await GET(request(), params())).json();
    expect(data.measurements.results[0]).toMatchObject({ snapshot_current: false, platforms: [{ metrics: [{ difference: null, interval95: null }] }] });
    vi.mocked(resolveGuard).mockResolvedValue(guard('basic'));
    expect((await (await GET(request(), params())).json()).measurements).toBeUndefined();
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...report, run_id: 'other', measurements: attachment } });
    expect((await GET(request(), params())).status).toBe(502);
  });
});
