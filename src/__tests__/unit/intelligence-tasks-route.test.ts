import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { project, runId, actionId, taskPack } from '../fixtures/task-workspace';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() } } }));
vi.mock('@/lib/visibility/project-context', () => ({ freezeProjectContext: vi.fn(), deliverProjectContext: vi.fn() }));
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { freezeProjectContext, deliverProjectContext } from '@/lib/visibility/project-context';
import { GET, POST } from '@/app/api/integration/intelligence/tasks/route';
const get = (p: string) => new NextRequest('http://localhost/api/integration/intelligence/tasks?projectId=attacker&' + p);
const post = (data: object) => new NextRequest('http://localhost/api/integration/intelligence/tasks?projectId=' + project, { method: 'POST', body: JSON.stringify({ projectId: 'attacker', ...data }) });
const ctx = { projectId: project, workspaceId: 'w1', session: { user: { id: 'trusted-user' } }, role: 'owner' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx } as Awaited<ReturnType<typeof resolveGuard>>);
  vi.mocked(fetchUpstream).mockResolvedValue({ data: { items: [] } });
  vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0);
});
describe('task/revision scoped bridge', () => {
  it('reads eligible facts and authorization versions for the exact action revision without writes', async () => {
    for (const [op, path] of [['eligibleFacts', 'eligible-facts'], ['draftApprovals', 'draft-approvals']]) {
      expect((await GET(get(`op=${op}&actionId=${actionId}`))).status).toBe(400);
      expect((await GET(get(`op=${op}&actionId=${actionId}&expectedRevision=2`))).status).toBe(200);
      expect(fetchUpstream).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: project }), `/api/intelligence/actions/${actionId}/${path}?offset=0&limit=50&expected_revision=2`, expect.anything());
    }
    expect(freezeProjectContext).not.toHaveBeenCalled(); expect(prisma.projectContextOutbox.count).not.toHaveBeenCalled();
  });
  it('performs read-only frozen and explicit current-ranking requests through the verified project', async () => {
    const response = await GET(get(`op=opportunities&runId=${runId}&priority=current&platform=doubao&ownTarget=registry%3Aown&offset=10&limit=20`));
    expect(response.status).toBe(200);
    const path = vi.mocked(fetchUpstream).mock.calls[0][1];
    expect(path).toContain(`/runs/${runId}/opportunities?`);
    expect(path).toContain('own_target_id=registry%3Aown'); expect(path).toContain('priority=current');
    expect(vi.mocked(fetchUpstream).mock.calls[0][0]).toMatchObject({ projectId: project });
    expect(freezeProjectContext).not.toHaveBeenCalled(); expect(prisma.projectContextOutbox.count).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('forwards only supported bounded history/source queries', async () => {
    expect((await GET(get(`op=revisions&actionId=${actionId}&limit=101`))).status).toBe(400);
    expect((await GET(get(`op=opportunities&runId=${runId}&priority=regenerate`))).status).toBe(400);
    expect((await GET(get(`op=opportunities&runId=${runId}&platform=evil`))).status).toBe(400);
    expect((await GET(get(`op=detail&actionId=${actionId}&url=https://evil.example`))).status).toBe(400);
    await GET(get(`op=revisions&actionId=${actionId}&offset=20&limit=20`));
    expect(fetchUpstream).toHaveBeenLastCalledWith(expect.anything(), `/api/intelligence/actions/${actionId}/revisions?offset=20&limit=20`, expect.anything());
    await GET(get(`op=sourceObservations&runId=${runId}&documentId=${'b'.repeat(32)}&platform=qwen`));
    expect(vi.mocked(fetchUpstream).mock.calls.at(-1)?.[1]).toContain('/source-observations?');
  });
  it('preserves all child targets and authoritative scope on a revision write', async () => {
    const response = await POST(post({ op: 'revise', actionId, expectedRevision: 2, taskPack: taskPack(), reason: '复核原文与全部子目标后具体化交付', idempotencyKey: 'revision-key-1' }));
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.objectContaining({ projectId: project }), `/api/intelligence/actions/${actionId}/revisions`, expect.objectContaining({ method: 'POST', body: {
      expectedRevision: 2, taskPack: taskPack(), reason: '复核原文与全部子目标后具体化交付', idempotencyKey: 'revision-key-1',
    } }));
    expect(freezeProjectContext).toHaveBeenCalledWith(expect.objectContaining({ projectId: project }));
  });
  it('fixes approval scope and rejects supplied actors, publication authority or foreign task provenance', async () => {
    const body = { op: 'approve', actionId, expectedRevision: 1, reason: '明确核对证据与任务交付边界', idempotencyKey: 'approval-key-1' };
    expect((await POST(post({ ...body, actor: 'attacker' }))).status).toBe(400);
    expect((await POST(post({ ...body, scope: 'publication' }))).status).toBe(400);
    expect((await POST(post({ ...body, expectedRevision: true }))).status).toBe(400);
    expect((await POST(post({ op: 'revise', actionId, expectedRevision: 1, taskPack: { ...taskPack(), project_id: 'foreign' }, reason: body.reason, idempotencyKey: body.idempotencyKey }))).status).toBe(400);
    expect((await POST(post(body))).status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/actions/${actionId}/approve`, expect.objectContaining({ body: expect.objectContaining({ scope: 'investigation_plan' }) }));
  });
  it('rejects viewers and pending context delivery before any task mutation', async () => {
    vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { ...ctx, role: 'viewer' } } as Awaited<ReturnType<typeof resolveGuard>>);
    const request = { op: 'create', runId, diagnosisId: 'd'.repeat(32), idempotencyKey: 'plan-key-123' };
    expect((await POST(post(request))).status).toBe(403);
    expect(freezeProjectContext).not.toHaveBeenCalled();
    vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx } as Awaited<ReturnType<typeof resolveGuard>>);
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    expect((await POST(post(request))).status).toBe(409);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it('retains structured dependency conflicts instead of reporting a successful revision', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ response: NextResponse.json({ detail: { code: 'action_dependencies_changed', changes: [{ dependency: 'identity' }] } }, { status: 409 }) });
    const response = await POST(post({ op: 'revise', actionId, expectedRevision: 1, title: '核对实施交付与限制条件', reason: '相关身份变化后需要重新核对', idempotencyKey: 'conflict-key-1' }));
    expect(response.status).toBe(409); expect((await response.json()).detail.code).toBe('action_dependencies_changed');
    expect(deliverProjectContext).toHaveBeenCalled();
  });
});
