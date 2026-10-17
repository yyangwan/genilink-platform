import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() } } }));
vi.mock('@/lib/billing/guard', () => ({ requireBilling: vi.fn() }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { requireBilling } from '@/lib/billing/guard';
import { prisma } from '@/lib/db';
import { GET } from '@/app/api/integration/content-workbench/route';
const id = 'a'.repeat(32);
const data = { schema: 'citation-content-workbench-1', project_id: 'p1', enabled: true, cursor: null, approval_id: null, next_cursor: null, publication_allowed: false, items: [{ id, status: 'ready', execution: { mode: 'generate_draft', channel: 'wechat' } }] };
const req = (query = '') => new NextRequest(`http://localhost/api/integration/content-workbench?projectId=p1${query}`);
function guard(role = 'editor') { return { ok: true, ctx: { projectId: 'p1', role, workspaceId: 'ws1', session: { user: { id: 'u1' } } } } as Awaited<ReturnType<typeof resolveGuard>>; }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(resolveGuard).mockResolvedValue(guard()); vi.mocked(fetchUpstream).mockResolvedValue({ data }); vi.mocked(requireBilling).mockResolvedValue({} as never); vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0); });
describe('approved evidence content workbench gateway', () => {
  it('requires both subscriptions and full evidence permission, uses verified project scope', async () => {
    const response = await GET(req()); expect(response.status).toBe(200);
    expect(resolveGuard).toHaveBeenCalledWith(expect.anything(), { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
    expect(requireBilling).toHaveBeenCalledWith('u1', 'ws1', 'content');
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), '/api/intelligence/projects/p1/content-workbench', expect.anything());
    expect((await response.json()).can_prepare).toBe(true); expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('keeps readonly roles and unsynced context from preparing or executing material', async () => {
    vi.mocked(resolveGuard).mockResolvedValue(guard('viewer'));
    expect((await (await GET(req())).json()).can_prepare).toBe(false);
    vi.mocked(resolveGuard).mockResolvedValue(guard()); vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    expect(await (await GET(req())).json()).toMatchObject({ can_prepare: false, context_sync_pending: true, items: [{ status: 'stale', execution: null }] });
  });
  it('validates cursor and exact grant context without caller-supplied bodies', async () => {
    expect((await GET(req('&cursor=wrong'))).status).toBe(400);
    expect((await GET(req(`&cursor=${id}&approvalId=${id}`))).status).toBe(400);
    expect(resolveGuard).not.toHaveBeenCalled();
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...data, approval_id: id } });
    expect((await GET(req(`&approvalId=${id}`))).status).toBe(200);
    expect(fetchUpstream).toHaveBeenLastCalledWith(expect.anything(), `/api/intelligence/projects/p1/content-workbench?approval_id=${id}`, expect.anything());
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...data, project_id: 'p2' } });
    expect((await GET(req())).status).toBe(502);
  });
  it('rejects publication-enabled payloads and preserves denied access or upstream errors', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...data, publication_allowed: true } }); expect((await GET(req())).status).toBe(502);
    vi.mocked(fetchUpstream).mockResolvedValue({ response: NextResponse.json({}, { status: 503 }) }); expect((await GET(req())).status).toBe(503);
    vi.mocked(requireBilling).mockRejectedValue(new Error('no content subscription')); expect((await GET(req())).status).toBe(403);
  });
});
