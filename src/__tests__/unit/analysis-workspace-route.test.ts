import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() } } }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { GET } from '@/app/api/integration/analysis-workspace/route';
const data = { schema: 'citation-workspace-1', project_id: 'p1', enabled: true, selected_audit_id: '12', observations: { mentions: ['private'] }, report: { schema: 'citation-report-1', project_id: 'p1', audit_id: '12', run_id: 'run12', status: 'ready', snapshot_current: true, entities: ['private'], evidence: ['private'], platforms: [] } };
const request = (view = 'insights', audit = '12') => new NextRequest(`http://localhost/api/integration/analysis-workspace?projectId=p1&view=${view}&auditId=${audit}`);
function guard(level = 'full', role = 'owner') { return { ok: true, ctx: { projectId: 'p1', role, billing: { capabilities: { contentInsights: level, optimizationAdvice: level, competitorComparison: level, strategicIntelligence: level } } } } as Awaited<ReturnType<typeof resolveGuard>>; }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(resolveGuard).mockResolvedValue(guard()); vi.mocked(fetchUpstream).mockResolvedValue({ data }); vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0); });
describe('analysis workspace scope and entitlements', () => {
  it.each([['compare', 'competitorComparison'], ['strategic', 'strategicIntelligence']])('uses the %s entitlement without exposing action mutation controls', async (view, capability) => {
    const body = await (await GET(request(view))).json();
    expect(resolveGuard).toHaveBeenCalledWith(expect.anything(), { capability });
    expect(body.can_act).toBe(false); expect(body.can_review).toBe(false);
    expect(body.observations).toEqual(view === 'compare' ? data.observations : null);
  });
  it('uses verified project/audit and view-specific entitlement', async () => {
    const body = await (await GET(request('suggestions'))).json();
    expect(resolveGuard).toHaveBeenCalledWith(expect.anything(), { capability: 'optimizationAdvice' });
    expect(fetchUpstream).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1' }), '/api/intelligence/projects/p1/workspace?audit_id=12', expect.anything());
    expect(body.observations).toBeNull(); expect(body.can_act).toBe(true);
  });
  it('redacts basic quotes and restricts viewer mutations', async () => {
    vi.mocked(resolveGuard).mockResolvedValue(guard('basic'));
    const body = await (await GET(request())).json();
    expect(body.observations).toBeNull(); expect(body.report.entities).toBeUndefined(); expect(body.report.evidence).toBeUndefined(); expect(body.can_review).toBe(false);
    vi.mocked(resolveGuard).mockResolvedValue(guard('full', 'viewer'));
    expect(await (await GET(request())).json()).toMatchObject({ can_act: false, can_review: false });
  });
  it('marks unsynced context stale while preserving evidence recall', async () => {
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    expect(await (await GET(request())).json()).toMatchObject({ can_act: false, can_review: true, context_sync_pending: true, report: { status: 'stale', snapshot_current: false } });
  });
  it('rejects invalid selectors and mixed audit/project snapshots', async () => {
    expect((await GET(request('unknown'))).status).toBe(400);
    expect((await GET(request('insights', '-1'))).status).toBe(400);
    expect(resolveGuard).not.toHaveBeenCalled();
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...data, selected_audit_id: '11' } });
    expect((await GET(request())).status).toBe(502);
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...data, report: { ...data.report, project_id: 'p2' } } });
    expect((await GET(request())).status).toBe(502);
  });
});
