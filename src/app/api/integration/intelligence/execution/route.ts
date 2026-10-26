import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { issueContentProjectJWT, issueVisibilityExecutionJWT, type ExecutionAuthority } from '@/lib/auth/service-jwt';
import { requestHash } from '@/lib/billing/idempotency';

const writers = ['owner', 'admin', 'editor', 'member'];
const id = z.string().regex(/^[a-f0-9]{32}$/);
const date = z.string().refine(value => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
const change = z.object({
  projectId: z.string().optional(), actionId: id, expectedRevision: z.number().int().positive(), expectedVersion: z.number().int().nonnegative(),
  operation: z.enum(['assign', 'prepare', 'start', 'deliver', 'return', 'accept', 'cancel']),
  ownerId: z.string().min(1).max(200).nullable().optional(), dueAt: date.nullable().optional(),
  artifacts: z.array(z.object({ kind: z.enum(['external_url', 'manual_record', 'content_workflow', 'manual_content_task']), title: z.string().trim().min(5).max(200),
    url: z.string().max(4096).nullable().optional(), referenceId: z.string().regex(/^[a-zA-Z0-9_-]{1,191}$/).nullable().optional(), notes: z.string().max(2000).optional() }).strict()).max(10).optional(),
  acceptanceChecks: z.array(z.object({ index: z.number().int().min(0).max(29), met: z.boolean(), note: z.string().max(1000).optional() }).strict()).max(30).optional(),
  reason: z.string().trim().min(5).max(2000), idempotencyKey: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
}).strict();
const headers = { 'Cache-Control': 'no-store' };
const invalid = () => NextResponse.json({ error: '执行参数或版本无效，请核对后重试。' }, { status: 400, headers });
type State = { action_id: string; revision_id: string; revision: number; version: number; is_current: boolean; snapshot: { owner: { id: string } | null } };

export async function GET(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  const q = req.nextUrl.searchParams, op = q.get('op') || 'state';
  if ([...q.keys()].some(key => !['projectId', 'op', 'actionId', 'revision', 'before', 'limit'].includes(key))) return invalid();
  if (op === 'members') {
    const rows = await prisma.workspaceMember.findMany({ where: { workspaceId: guard.ctx.workspaceId, role: { in: writers } }, select: { userId: true, role: true, user: { select: { name: true } } }, orderBy: { joinedAt: 'asc' } });
    return NextResponse.json({ members: rows.map(row => ({ id: row.userId, name: row.user.name, role: row.role })) }, { headers });
  }
  if (!id.safeParse(q.get('actionId')).success || !/^[1-9][0-9]{0,8}$/.test(q.get('revision') || '') || !['state', 'events'].includes(op)) return invalid();
  const params = new URLSearchParams({ revision: q.get('revision')! });
  if (op === 'events') {
    const before = q.get('before'), limit = q.get('limit') || '20';
    if (before && !/^[1-9][0-9]{0,8}$/.test(before) || !/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) return invalid();
    if (before) params.set('before', before); params.set('limit', limit);
  }
  const result = await fetchUpstream(guard.ctx, `/api/intelligence/actions/${q.get('actionId')}/execution${op === 'events' ? '/events' : ''}?${params}`, { errorMessage: '执行记录暂不可读，请稍后重试。' });
  return 'response' in result ? result.response : NextResponse.json({ ...(result.data as object), can_write: writers.includes(guard.ctx.role), can_review: ['owner', 'admin', 'editor'].includes(guard.ctx.role) }, { headers });
}

export async function POST(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  const ctx = guard.ctx;
  if (!writers.includes(ctx.role)) return NextResponse.json({ error: '需要当前项目执行权限。' }, { status: 403, headers });
  const parsed = change.safeParse(await req.json().catch(() => null)); if (!parsed.success) return invalid();
  const { projectId: _project, actionId, ...body } = parsed.data;
  const read = await fetchUpstream(ctx, `/api/intelligence/actions/${actionId}/execution?revision=${body.expectedRevision}`, { errorMessage: '执行版本暂不可读，未保存本次操作。' });
  if ('response' in read) return read.response;
  const state = read.data as State;
  if (state.action_id !== actionId || state.revision !== body.expectedRevision || !Number.isSafeInteger(state.version)) return NextResponse.json({ error: '执行范围不匹配。' }, { status: 409, headers });
  const authority: ExecutionAuthority = { action_id: actionId, revision: body.expectedRevision, request_hash: requestHash(body) };
  // On advanced versions, ask the backend to replay an existing receipt or reject CAS.
  // Do not repeat external reads or turn an uncertain successful operation into a new write.
  if (state.is_current && state.version === body.expectedVersion) {
    const member = async (userId: string) => prisma.workspaceMember.findFirst({ where: { workspaceId: ctx.workspaceId, userId, role: { in: writers } }, select: { userId: true, role: true, user: { select: { name: true } } } });
    if (body.operation === 'assign' && body.ownerId) {
      const person = await member(body.ownerId);
      if (!person) return NextResponse.json({ error: '负责人不在当前工作空间的可执行成员中。' }, { status: 403, headers });
      authority.owner = { id: person.userId, name: person.user.name, role: person.role };
    }
    if (['start', 'deliver', 'accept'].includes(body.operation) && state.snapshot.owner) {
      const person = await member(state.snapshot.owner.id);
      if (!person) return NextResponse.json({ error: '原负责人已不可用，请先重新安排负责人。' }, { status: 409, headers });
      authority.current_owner_id = person.userId;
    }
    const services = body.operation === 'deliver' ? (body.artifacts || []).filter(row => ['content_workflow', 'manual_content_task'].includes(row.kind)) : [];
    if (services.length) {
      const token = await issueContentProjectJWT({ userId: ctx.session.user.id, workspaceId: ctx.workspaceId, projectId: ctx.projectId, role: ctx.role });
      authority.artifacts = [];
      for (const artifact of services) {
        if (!artifact.referenceId) return invalid();
        try {
          const response = await fetch(`${process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003'}/api/evidence-briefs/delivery-receipt?${new URLSearchParams({ kind: artifact.kind, referenceId: artifact.referenceId })}`, {
            headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(8000),
          });
          const raw = await response.json(), receipt = raw?.data;
          if (!response.ok) return NextResponse.json({ error: raw.error || '交付来源尚未就绪。' }, { status: response.status >= 500 ? 503 : response.status, headers });
          if (!receipt || receipt.project_id !== ctx.projectId || receipt.action_id !== actionId || receipt.revision_id !== state.revision_id || receipt.reference_id !== artifact.referenceId || receipt.kind !== artifact.kind ||
              receipt.status !== (artifact.kind === 'content_workflow' ? 'succeeded' : 'completed') || !/^[a-f0-9]{64}$/.test(receipt.snapshot_hash) || !/^[a-f0-9]{32}$/.test(receipt.approval_id)) return NextResponse.json({ error: '交付来源不属于本行动修订，或尚未完成。' }, { status: 409, headers });
          authority.artifacts.push({ kind: receipt.kind, reference_id: receipt.reference_id, project_id: receipt.project_id, action_id: receipt.action_id, revision_id: receipt.revision_id,
            approval_id: receipt.approval_id, snapshot_hash: receipt.snapshot_hash, status: receipt.status, content_id: receipt.content_id || null, observed_at: new Date().toISOString() });
        } catch { return NextResponse.json({ error: '内容服务暂不可用，未保存本次交付。' }, { status: 503, headers }); }
      }
    }
  }
  const token = await issueVisibilityExecutionJWT({ userId: ctx.session.user.id, workspaceId: ctx.workspaceId, projectId: ctx.projectId, role: ctx.role, executionAuthority: authority });
  const result = await fetchUpstream(ctx, `/api/intelligence/actions/${actionId}/execution`, { method: 'POST', body, headers: { Authorization: `Bearer ${token}` }, timeoutMs: 30000, errorMessage: '保存结果尚待确认，请用同一操作重试。' });
  return 'response' in result ? result.response : NextResponse.json(result.data, { status: 202, headers });
}
