import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { freezeProjectContext, deliverProjectContext } from '@/lib/visibility/project-context';
import { prisma } from '@/lib/db';
import { platformSchema, taskPackSchema } from '@/lib/visibility/task-contract';

const id = z.string().regex(/^[a-f0-9]{32}$/);
const key = z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/);
const reason = z.string().trim().min(5).max(2000);
const base = { projectId: z.string().optional(), idempotencyKey: key };
const write = z.discriminatedUnion('op', [
  z.object({ ...base, op: z.literal('create'), runId: id, diagnosisId: id }).strict(),
  z.object({ ...base, op: z.literal('approve'), actionId: id, expectedRevision: z.number().int().positive(), reason }).strict(),
  z.object({ ...base, op: z.literal('revise'), actionId: id, expectedRevision: z.number().int().positive(), reason,
    title: z.string().trim().min(5).max(2000).optional(), taskPack: taskPackSchema.optional(), diagnosisId: id.optional(),
  }).strict(),
]);
const invalid = () => NextResponse.json({ error: '查询或任务参数无效，请核对版本和范围。' }, { status: 400 });
const headers = { 'Cache-Control': 'no-store' };

export async function GET(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  const p = req.nextUrl.searchParams, op = p.get('op') || 'opportunities';
  if ([...p.keys()].some(name => !['projectId', 'op', 'runId', 'actionId', 'offset', 'limit', 'priority', 'ownTarget', 'platform', 'documentId'].includes(name))) return invalid();
  const offset = p.get('offset') || '0', limit = p.get('limit') || '50';
  if (!/^\d{1,8}$/.test(offset) || !/^\d{1,3}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100) return invalid();
  const query = new URLSearchParams({ offset, limit });
  let path: string;
  if (op === 'detail' || op === 'revisions') {
    if (!id.safeParse(p.get('actionId')).success) return invalid();
    path = `/api/intelligence/actions/${p.get('actionId')}${op === 'revisions' ? `/revisions?${query}` : ''}`;
  } else {
    if (!id.safeParse(p.get('runId')).success) return invalid();
    path = `/api/intelligence/runs/${p.get('runId')}`;
    if (op === 'opportunities') {
      const priority = p.get('priority') || 'frozen';
      if (!['frozen', 'current'].includes(priority)) return invalid();
      query.set('priority', priority);
      const own = p.get('ownTarget');
      if (own) { if (own.length > 200) return invalid(); query.set('own_target_id', own); }
      path += '/opportunities';
    } else if (op === 'sourceObservations') {
      const document = p.get('documentId');
      if (document) { if (!id.safeParse(document).success) return invalid(); query.set('document_id', document); }
      path += '/source-observations';
    } else if (op === 'plans') path += '/actions';
    else return invalid();
    const platform = p.get('platform');
    if (platform) { if (!platformSchema.safeParse(platform).success) return invalid(); query.set('platform', platform); }
    if (op !== 'plans') path += '?' + query;
  }
  const result = await fetchUpstream(guard.ctx, path, { errorMessage: '任务与证据暂不可读，请刷新重试。' });
  return 'response' in result ? result.response : NextResponse.json({ ...(result.data as object), can_write: ['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role) }, { headers });
}

export async function POST(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  if (!['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role) || !guard.ctx.session.user.id) return NextResponse.json({ error: '需要具名项目写入权限。' }, { status: 403 });
  const data = write.safeParse(await req.json().catch(() => null));
  if (!data.success) return invalid();
  const body = data.data;
  if (body.op === 'revise' && body.taskPack && (body.taskPack.project_id !== guard.ctx.projectId || body.taskPack.diagnostic_evidence.some(ref => ref.project_id !== guard.ctx.projectId))) return invalid();
  try {
    await freezeProjectContext(guard.ctx);
    const delivery = await deliverProjectContext(guard.ctx);
    if (delivery) return delivery;
  } catch { return NextResponse.json({ error: '品牌配置同步暂未完成，请核对后重试。' }, { status: 409 }); }
  if (await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } })) return NextResponse.json({ error: '品牌配置尚未同步，请先完成同步。' }, { status: 409 });
  let path: string, payload: object;
  if (body.op === 'create') {
    path = `/api/intelligence/runs/${body.runId}/actions`;
    payload = { diagnosisId: body.diagnosisId, idempotencyKey: body.idempotencyKey };
  } else {
    path = `/api/intelligence/actions/${body.actionId}/${body.op === 'approve' ? 'approve' : 'revisions'}`;
    const { projectId: _project, actionId: _action, op: _op, ...values } = body;
    payload = body.op === 'approve' ? { ...values, scope: 'investigation_plan' } : values;
  }
  const result = await fetchUpstream(guard.ctx, path, { method: 'POST', body: payload, timeoutMs: 30000, errorMessage: '保存结果暂未确认，请使用同一操作重试。' });
  return 'response' in result ? result.response : NextResponse.json(result.data, { status: 202, headers });
}
