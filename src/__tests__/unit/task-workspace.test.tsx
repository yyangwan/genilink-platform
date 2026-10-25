// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within, act } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { ActionPlans } from '@/components/visibility/action-plans';
import { EvidenceReading } from '@/components/visibility/task-details';
import { matchesOpportunity } from '@/lib/visibility/task-view';
import { taskPackSchema } from '@/lib/visibility/task-contract';
import type { TaskOpportunity, TaskPlan } from '@/lib/visibility/task-contract';
import { actionId, fullText, opportunity, plan, project, question, run, runId, taskPack } from '../fixtures/task-workspace';

let rows: TaskOpportunity[], plans: TaskPlan[], posts: string[], uncertain: boolean, conflict: boolean, readFails: boolean, canWrite: boolean;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  window.history.replaceState({}, '', `/?project=${project}&runId=${runId}&view=actions`);
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
  rows = [opportunity()]; plans = []; posts = []; uncertain = false; conflict = false; readFails = false; canWrite = true;
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    const p = new URL(input, 'http://localhost').searchParams, op = p.get('op');
    if (options?.method === 'POST') {
      posts.push(String(options.body));
      if (uncertain) { uncertain = false; throw Error('timeout'); }
      const body = JSON.parse(String(options.body));
      if (conflict) { conflict = false; plans = [plan({ revision: 2 })]; return response({ detail: { code: 'action_dependencies_changed' } }, 409); }
      if (body.op === 'create') plans = [plan()];
      if (body.op === 'approve') plans = [plan({ revision: body.expectedRevision, status: 'approved', approval_valid: true })];
      if (body.op === 'revise') plans = [plan({ revision: body.expectedRevision + 1, revision_id: '3'.repeat(32), title: body.title, target: { ...opportunity(), task_pack: body.taskPack }, status: 'proposed' })];
      return response(body.op === 'revise' ? { action: plans[0], created_revision: plans[0].revision } : plans[0], 202);
    }
    if (readFails) return response({ error: '读取暂不可用' }, 503);
    if (op === 'plans') return response({ actions: plans });
    if (op === 'detail') return response(plans.find(row => row.id === p.get('actionId')) || plan());
    if (op === 'revisions') return response({ revisions: [{ id: '8'.repeat(32), revision: 1, run_id: runId, reason: '按原文形成具体交付', actor_id: 'reviewer', created_at: '2026-10-25T08:00:00Z', is_current: false, integrity_valid: true,
      payload: { title: plan().title, target: opportunity() }, changes_from_previous: { task: [], dependencies: [] }, approval: { id: '7'.repeat(32), reason: '已核对该版本全部原问题与材料范围', actor_id: 'reviewer', historical_signature_valid: true }, draft_approval_ids: ['6'.repeat(32)] }] });
    if (p.get('view') === 'content') return response({ items: [{ id: 'c'.repeat(32), start: 0, end: Array.from(fullText).length, text: fullText }], next_offset: null });
    return response({ version: 'opportunities-v1', status: 'evaluated', can_write: canWrite, items: rows, total: rows.length, next_offset: null, ranking_scope: p.get('priority'), input_quality: {}, policy: { version: 'policy-v1' } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const choose = async () => { fireEvent.click((await screen.findAllByRole('button', { name: '查看具体任务 →' }))[0]); return screen.findByRole('region', { name: '当前具体任务' }); };

it('shows all original questions and platform child targets after a platform filter', async () => {
  render(<ActionPlans run={run} projectId={project} />);
  await screen.findByText('优先序 1 · 内容证据机会');
  fireEvent.change(screen.getByLabelText('行动目标平台'), { target: { value: 'qwen' } });
  const detail = await choose();
  expect(within(detail).getAllByText(question)).toHaveLength(2);
  expect(within(detail).getAllByText('豆包').length).toBeGreaterThan(0);
  expect(within(detail).getByText('我方实施说明 · 新交付物')).toBeInTheDocument();
  expect(new URLSearchParams(window.location.search).get('platform')).toBe('qwen');
  expect(screen.queryByText('app')).toBeNull();
  expect(detail).toHaveFocus();
});
it('does not offer creation for a non-applicable scope and preserves its exclusion', async () => {
  rows = [opportunity({ actionability: 'not_applicable', action: null, task_pack: null, subtargets: [], excluded_scopes: [{ platform: 'qwen', prompt_hash: '0'.repeat(64), scenario_id: 'implementation', actionability: 'not_applicable', finding: '原问题指定其他品牌，不能作为中性比较目标。' }] })];
  render(<ActionPlans run={run} projectId={project} />);
  const detail = await choose();
  expect(within(detail).queryByRole('button', { name: '创建具体行动计划' })).toBeNull();
  expect(within(detail).getByText(/当前仅保留核对线索/)).toBeInTheDocument();
  expect(posts).toHaveLength(0);
});
it('creates, revises and reapproves the exact full task without inheriting approval', async () => {
  render(<ActionPlans run={run} projectId={project} />);
  await choose();
  fireEvent.click(screen.getByRole('button', { name: '创建具体行动计划' }));
  await screen.findByRole('button', { name: '修改并创建新修订' });
  fireEvent.click(screen.getByRole('button', { name: '审核并批准计划' }));
  fireEvent.change(screen.getByLabelText('审批依据'), { target: { value: '核对原问题、两平台观察及我方材料限制' } });
  fireEvent.click(screen.getByRole('button', { name: '批准本修订计划' }));
  await screen.findAllByText('计划批准有效');
  fireEvent.click(screen.getByRole('button', { name: '修改并创建新修订' }));
  fireEvent.change(screen.getByLabelText('具体交付'), { target: { value: '补齐我方权限边界说明及验收清单' } });
  fireEvent.change(screen.getByLabelText('本次修订依据'), { target: { value: '负责人要求增加可核对的实施验收范围' } });
  fireEvent.click(screen.getByRole('button', { name: '保存新修订，重新审核' }));
  await waitFor(() => expect(posts).toHaveLength(3));
  const body = JSON.parse(posts[2]);
  expect(body.expectedRevision).toBe(1);
  expect(body.taskPack.ai_targets).toEqual(taskPack().ai_targets);
  expect(body.taskPack.delivery.questions).toEqual(taskPack().delivery.questions);
  expect(body.taskPack.diagnostic_evidence).toEqual(taskPack().diagnostic_evidence);
  await screen.findAllByText(/修订 2/);
  expect(screen.queryByText('计划批准有效')).toBeNull();
  expect(screen.getByRole('button', { name: '审核并批准计划' })).toBeEnabled();
});
it('retries the exact same serialized request after an uncertain write', async () => {
  render(<ActionPlans run={run} projectId={project} />);
  await choose(); uncertain = true;
  fireEvent.click(screen.getByRole('button', { name: '创建具体行动计划' }));
  const retry = await screen.findByRole('button', { name: '重试同一操作' });
  expect(screen.getByRole('button', { name: '创建具体行动计划' })).toBeDisabled();
  fireEvent.click(retry);
  await screen.findByRole('button', { name: '修改并创建新修订' });
  expect(posts).toHaveLength(2); expect(posts[0]).toBe(posts[1]);
});
it('does not retry a successful mutation merely because the following read fails', async () => {
  render(<ActionPlans run={run} projectId={project} />);
  await choose(); readFails = true;
  fireEvent.click(screen.getByRole('button', { name: '创建具体行动计划' }));
  await screen.findByText(/操作已保存/);
  await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
  expect(screen.queryByRole('button', { name: '重试同一操作' })).toBeNull();
  expect(posts).toHaveLength(1);
});
it('keeps a conflicting edit blocked instead of applying it to a newer version', async () => {
  plans = [plan()];
  render(<ActionPlans run={run} projectId={project} />);
  await choose();
  fireEvent.click(await screen.findByRole('button', { name: '修改并创建新修订' }));
  fireEvent.change(screen.getByLabelText('行动标题'), { target: { value: '核对实施边界和交付范围的新修订标题' } });
  fireEvent.change(screen.getByLabelText('本次修订依据'), { target: { value: '明确本次修订交付范围和原始依据' } });
  conflict = true;
  fireEvent.click(screen.getByRole('button', { name: '保存新修订，重新审核' }));
  await screen.findByText(/本次编辑没有自动套用到新版本/);
  expect(screen.getByRole('button', { name: '保存新修订，重新审核' })).toBeDisabled();
  expect(JSON.parse(posts[0]).expectedRevision).toBe(1);
  expect(posts).toHaveLength(1);
});
it('keeps out-of-scope task evidence visible with an explicit scope warning', async () => {
  render(<ActionPlans run={run} projectId={project} />);
  await choose();
  fireEvent.change(screen.getByLabelText('行动对比品牌'), { target: { value: 'entity:other' } });
  await screen.findByText(/这项任务不属于当前筛选范围/);
  expect(screen.getAllByText(question)).toHaveLength(2);
  expect(screen.getByText('当前范围没有具备依据的机会')).toBeInTheDocument();
});
it('makes permissions visible and avoids write buttons for a viewer', async () => {
  canWrite = false;
  render(<ActionPlans run={run} projectId={project} />);
  await choose();
  expect(screen.getByRole('button', { name: '创建具体行动计划' })).toBeDisabled();
  expect(screen.getByText(/当前为只读权限/)).toBeInTheDocument();
});
it('shows signed old revision contents and its original approval as history', async () => {
  plans = [plan({ revision: 2 })];
  render(<ActionPlans run={run} projectId={project} />);
  await choose(); fireEvent.click(await screen.findByRole('button', { name: '查看修订与批准历史 →' }));
  const dialog = await screen.findByRole('dialog', { name: '行动修订与批准历史' });
  expect(await within(dialog).findByText('修订 1 · 历史版本')).toBeInTheDocument();
  expect(within(dialog).getByText(/原签名校验通过/)).toBeInTheDocument();
  expect(within(dialog).getByText(/1 份草稿批准记录属于此原版本/)).toBeInTheDocument();
});
it('locates exact Unicode evidence and preserves the frozen excerpt on mismatch', async () => {
  const ref = taskPack().diagnostic_evidence[0];
  render(<EvidenceReading reference={ref} projectId={project} onClose={vi.fn()} />);
  await waitFor(() => expect(document.querySelector('mark')).toHaveTextContent(ref.quote));
  expect(document.querySelector('mark')?.previousSibling?.textContent).toBe('🧭');
  cleanup();
  vi.mocked(fetch).mockResolvedValue(response({ items: [{ id: ref.segment_id, start: 0, end: 30, text: '不相符的另一个原文版本' }], next_offset: null }));
  render(<EvidenceReading reference={ref} projectId={project} onClose={vi.fn()} />);
  await screen.findByText(/当前保存片段与任务摘录不一致/);
  expect(screen.getByText(ref.quote)).toBeInTheDocument();
  expect(document.querySelector('mark')).toBeNull();
});
it('matches comparison, platform and scenario on the same observation', () => {
  const row = opportunity();
  row.subtargets[1].comparison_target_id = 'entity:other';
  expect(matchesOpportunity(row, { own: '', comparison: 'entity:other', platform: 'qwen', scenario: 'implementation', opportunity: '', action: '' })).toBe(false);
  expect(taskPackSchema.safeParse(taskPack()).success).toBe(true);
});
it('keeps project, run and action deep links when navigating to own materials', async () => {
  plans = [plan()];
  render(<ActionPlans run={run} projectId={project} />);
  await choose(); await screen.findByRole('button', { name: '修改并创建新修订' });
  fireEvent.click(screen.getByRole('button', { name: '补齐并核实我方材料' }));
  const p = new URLSearchParams(window.location.search);
  expect(p.get('actionId')).toBe(actionId); expect(p.get('runId')).toBe(runId); expect(p.get('sourceType')).toBe('owned');
  await act(async () => {});
});
