import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() }, usageEvent: { findFirst: vi.fn() } } }));
vi.mock('@/lib/auth/workspace', () => ({ getWorkspaceRole: vi.fn(), verifyProjectInWorkspace: vi.fn() }));
vi.mock('@/lib/auth/service-jwt', () => ({ issueVisibilityProjectJWT: vi.fn().mockResolvedValue('fake-fresh-token') }));
vi.mock('@/lib/billing/guard', () => ({ requireBilling: vi.fn(), requireBillingCapability: vi.fn() }));
import { prisma } from '@/lib/db';
import { getWorkspaceRole, verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { issueVisibilityProjectJWT } from '@/lib/auth/service-jwt';
import { POST } from '@/app/api/internal/content-evidence/verify/route';

const body = { operationId: 'op', workspaceId: 'ws', projectId: 'p1', approvalId: 'a'.repeat(32) };
const req = (data: unknown = body, token = 'fake-callback-secret') => new Request('http://localhost/api/internal/content-evidence/verify', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(data) });
describe('bound evidence authorization callback', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0); vi.stubEnv('CONTENT_USAGE_CALLBACK_SECRET', 'fake-callback-secret'); vi.mocked(prisma.usageEvent.findFirst).mockResolvedValue({ userId: 'ledger-user', workspaceId: 'ws', status: 'reserved', metadata: { source: 'evidence_v3', projectId: 'p1', approvalId: body.approvalId } } as never); vi.mocked(getWorkspaceRole).mockResolvedValue('editor'); vi.mocked(verifyProjectInWorkspace).mockResolvedValue({ id: 'p1' }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ approval: { id: body.approvalId } })))); });
  it('derives the token identity and role from the ledger and current membership', async () => {
    expect((await POST(req())).status).toBe(200);
    expect(issueVisibilityProjectJWT).toHaveBeenCalledWith({ userId: 'ledger-user', workspaceId: 'ws', projectId: 'p1', role: 'editor' });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/draft-approvals/${body.approvalId}/brief`), expect.objectContaining({ headers: { Authorization: 'Bearer fake-fresh-token' }, cache: 'no-store' }));
  });
  it('rejects missing credentials, caller identity and cross-project bindings', async () => {
    expect((await POST(req(body, 'wrong'))).status).toBe(401);
    expect((await POST(req({ ...body, userId: 'attacker' }))).status).toBe(422);
    expect((await POST(req({ ...body, projectId: 'other' }))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects revoked membership and released quota before fetching evidence', async () => {
    vi.mocked(getWorkspaceRole).mockResolvedValue('viewer'); expect((await POST(req())).status).toBe(403);
    vi.mocked(prisma.usageEvent.findFirst).mockResolvedValue({ userId: 'ledger-user', status: 'released' } as never); expect((await POST(req())).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('propagates stale approval and fails closed on authority outages', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 409 })); expect((await POST(req())).status).toBe(409);
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline')); expect((await POST(req())).status).toBe(503);
  });
  it('does not renew worker authority while a committed context update is pending', async () => {
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    expect((await POST(req())).status).toBe(409);
    expect(issueVisibilityProjectJWT).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

});
