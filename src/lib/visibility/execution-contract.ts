import { z } from 'zod';
import { apiError } from './task-view';

const id = z.string().min(1).max(200);
const timestamp = z.string().refine(value => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
export const artifactKinds = ['external_url', 'content_workflow', 'manual_content_task', 'manual_record'] as const;
export const artifactLabels: Record<typeof artifactKinds[number], string> = { external_url: '外部交付地址', content_workflow: 'ContentOS 草稿', manual_content_task: 'ContentOS 人工任务', manual_record: '材料核实记录' };
const artifact = z.object({ kind: z.enum(artifactKinds), title: z.string(), url: z.string().nullable(), reference_id: z.string().nullable(), notes: z.string(),
  verification: z.enum(['manual_registration', 'service_receipt']), receipt: z.object({ approval_id: id, revision_id: id, reference_id: id, snapshot_hash: z.string(), status: z.string() }).passthrough().optional() });
export const snapshotSchema = z.object({ status: z.enum(['not_started', 'preparing_materials', 'in_progress', 'delivered', 'accepted', 'cancelled']),
  owner: z.object({ id, name: z.string(), role: z.string() }).nullable(), due_at: timestamp.nullable(),
  delivery: z.object({ event_id: id, actor_id: id, submitted_at: timestamp, artifacts: z.array(artifact).min(1).max(10), notes: z.string() }).nullable(),
  acceptance: z.object({ delivery_event_id: id, actor_id: id, decision: z.enum(['accept', 'return']), checks: z.array(z.object({ index: z.number().int().nonnegative(), met: z.boolean(), note: z.string(), criterion: z.string() })), reason: z.string() }).nullable(),
});
export const executionSchema = z.object({ action_id: id, revision_id: id, revision: z.number().int().positive(), version: z.number().int().nonnegative(), is_current: z.boolean(),
  snapshot: snapshotSchema, publication_allowed: z.literal(false), acceptance_is_visibility_improvement: z.literal(false), plan_approval_valid: z.boolean(),
  can_write: z.boolean(), can_review: z.boolean(), can_manage: z.boolean(), actor_id: id });
export type Execution = z.infer<typeof executionSchema>;
export type ExecutionSnapshot = z.infer<typeof snapshotSchema>;
export const eventSchema = z.object({ id, version: z.number().int().positive(), operation: z.string(), actor_id: id, actor_role: z.string(), reason: z.string(), created_at: timestamp,
  before: snapshotSchema, after: snapshotSchema, integrity_valid: z.boolean() });
export type ExecutionEvent = z.infer<typeof eventSchema>;
export type Member = { id: string; name: string; role: string };
export const statusLabels: Record<ExecutionSnapshot['status'], string> = { not_started: '待开始', preparing_materials: '准备材料', in_progress: '执行中', delivered: '待验收', accepted: '已验收', cancelled: '已取消' };
export const operationLabels: Record<string, string> = { assign: '安排负责人和截止时间', prepare: '准备材料', start: '开始执行', deliver: '提交交付', return: '交付退回修改', accept: '具名验收通过', cancel: '取消执行' };
const endpoint = '/api/integration/intelligence/execution';
export async function executionRead(query: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(endpoint + '?' + new URLSearchParams(query), { cache: 'no-store', signal });
  const raw = await response.json();
  if (!response.ok) throw Error(apiError(raw, '执行记录读取失败，请重试。'));
  return raw;
}
export async function readExecution(projectId: string, actionId: string, revision: number, revisionId: string, signal?: AbortSignal) {
  const value = executionSchema.parse(await executionRead({ projectId, actionId, revision: String(revision), op: 'state' }, signal));
  if (value.action_id !== actionId || value.revision !== revision || value.revision_id !== revisionId) throw Error('执行记录不属于所选任务修订，请重新读取。');
  return value;
}
export async function readEvents(projectId: string, actionId: string, revision: number, revisionId: string, before?: number, signal?: AbortSignal) {
  const page = z.object({ action_id: id, revision_id: id, revision: z.number().int(), events: z.array(eventSchema).max(20), next_before: z.number().int().positive().nullable() }).parse(await executionRead({ projectId, actionId, revision: String(revision), op: 'events', limit: '20', ...(before ? { before: String(before) } : {}) }, signal));
  const lastVersion = page.events.at(-1)?.version;
  const expectedNext = lastVersion && lastVersion > 1 ? lastVersion - 1 : null;
  if (page.action_id !== actionId || page.revision_id !== revisionId || page.revision !== revision || before !== undefined && (!page.events.length || page.events[0].version !== before) || page.events.some((row, index) => index > 0 && row.version !== page.events[index - 1].version - 1) || page.next_before !== expectedNext) throw Error('执行历史分页不一致，请重新读取。');
  return page;
}
