// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TaskExecution } from '@/components/visibility/task-execution';
import { readEvents } from '@/lib/visibility/execution-contract';
import type { Execution, ExecutionEvent } from '@/lib/visibility/execution-contract';
import { emptyExecution, execution, executionEvent } from '../fixtures/execution';
import { project, actionId, taskPack } from '../fixtures/task-workspace';

let value: Execution, events: ExecutionEvent[], posts: string[], uncertain: boolean, conflict: boolean;
const members = [{ id: 'user', name: '林悦', role: 'owner' }, { id: 'other', name: '陈宁', role: 'editor' }];
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const props = () => ({ projectId: project, actionId, revision: value.revision, revisionId: value.revision_id, pack: taskPack() });
const owner = { id: 'user', name: '林悦', role: 'owner' };
const reason = async (text = '按原问题与任务范围核对本次操作') => { fireEvent.change(await screen.findByLabelText('操作依据'), { target: { value: text } }); };
beforeEach(() => {
  value = execution(); events = []; posts = []; uncertain = false; conflict = false;
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
  vi.stubGlobal('fetch', vi.fn(async (input: string, options?: RequestInit) => {
    const q = new URL(input, 'http://localhost').searchParams;
    if (options?.method === 'POST') {
      posts.push(String(options.body));
      if (uncertain) { uncertain = false; throw Error('timeout'); }
      if (conflict) { conflict = false; return response({ error: '相关依据已经变化' }, 409); }
      const body = JSON.parse(String(options.body));
      const snapshot = structuredClone(value.snapshot);
      if (body.operation === 'assign') { snapshot.owner = body.ownerId ? members.find(row => row.id === body.ownerId)! : null; snapshot.due_at = body.dueAt; }
      if (body.operation === 'prepare') snapshot.status = 'preparing_materials';
      if (body.operation === 'start' || body.operation === 'return') snapshot.status = 'in_progress';
      if (body.operation === 'deliver') {
        snapshot.status = 'delivered'; snapshot.acceptance = null;
        snapshot.delivery = { event_id: 'a'.repeat(32), actor_id: 'user', submitted_at: '2026-10-26T08:00:00Z', notes: body.reason,
          artifacts: body.artifacts.map((row: { kind: string; title: string; url?: string; referenceId?: string; notes: string }) => ({ ...row, url: row.url || null, reference_id: row.referenceId || null, verification: row.referenceId ? 'service_receipt' : 'manual_registration', ...(row.referenceId ? { receipt: { approval_id: 'b'.repeat(32), revision_id: value.revision_id, reference_id: row.referenceId, snapshot_hash: 'c'.repeat(64), status: 'succeeded' } } : {}) })) };
      }
      if (body.operation === 'accept') snapshot.status = 'accepted';
      if (body.operation === 'accept' || body.operation === 'return') snapshot.acceptance = { delivery_event_id: snapshot.delivery!.event_id, actor_id: 'user', decision: body.operation, checks: body.acceptanceChecks.map((row: { index: number; met: boolean }) => ({ ...row, note: '', criterion: taskPack().acceptance[row.index] })), reason: body.reason };
      if (body.operation === 'cancel') snapshot.status = 'cancelled';
      value = { ...value, version: value.version + 1, snapshot };
      const event = executionEvent(value.version, snapshot, body.operation); events.unshift(event);
      return response({ saved_version: value.version, event_id: event.id, snapshot }, 202);
    }
    if (q.get('op') === 'members') return response({ members });
    if (q.get('op') === 'events') {
      const before = Number(q.get('before') || value.version), rows = events.filter(row => row.version <= before).slice(0, 20);
      return response({ action_id: actionId, revision: value.revision, revision_id: value.revision_id, events: rows, next_before: before > 20 ? before - 20 : null });
    }
    return response(value);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('keeps initial reads side-effect free and assigns a named member before execution', async () => {
  render(<TaskExecution {...props()} />);
  await screen.findByText('待安排'); expect(posts).toHaveLength(0);
  expect(screen.getByRole('button', { name: '开始执行' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '安排负责人 / 截止时间' }));
  fireEvent.change(screen.getByLabelText('负责人', { selector: 'select' }), { target: { value: 'user' } });
  await reason(); fireEvent.click(screen.getByRole('button', { name: '保存安排' }));
  await screen.findByText('林悦 · 负责人');
  expect(JSON.parse(posts[0])).toMatchObject({ expectedVersion: 0, expectedRevision: 1, ownerId: 'user', dueAt: null });
  expect(JSON.parse(posts[0])).not.toHaveProperty('actorId');
  expect(screen.getByRole('button', { name: '开始执行' })).toBeEnabled();
});
it('separates delivery, criterion review and acceptance without publishing', async () => {
  value.snapshot = { ...emptyExecution, status: 'in_progress', owner };
  render(<TaskExecution {...props()} />);
  fireEvent.click(await screen.findByRole('button', { name: '提交交付' }));
  fireEvent.change(screen.getByLabelText('交付标题'), { target: { value: '门店权限与实施说明' } });
  fireEvent.change(screen.getByLabelText('交付地址', { exact: true }), { target: { value: 'https://example.com/guide' } });
  await reason('已补齐适用版本与权限边界，请按原标准检查');
  fireEvent.click(screen.getByRole('button', { name: '提交交付，等待验收' }));
  await screen.findByRole('button', { name: '验收本次交付' });
  expect(within(screen.getByRole('region', { name: '最近一次交付' })).getByText(/人工登记/)).toBeInTheDocument();
  expect(posts).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: '验收本次交付' })); await reason();
  expect(screen.getByRole('button', { name: '确认验收通过' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: taskPack().acceptance[0] }));
  fireEvent.click(screen.getByRole('button', { name: '确认验收通过' }));
  await screen.findByText('本次交付已验收');
  expect(JSON.parse(posts[1])).toMatchObject({ operation: 'accept', expectedVersion: 1, acceptanceChecks: [{ index: 0, met: true }] });
  expect(posts.join(' ')).not.toContain('publish');
});
it('freezes an uncertain operation and retries exactly the same JSON and key', async () => {
  value.snapshot = { ...emptyExecution, owner }; uncertain = true;
  render(<TaskExecution {...props()} />);
  fireEvent.click(await screen.findByRole('button', { name: '开始执行' })); await reason();
  fireEvent.click(screen.getByRole('button', { name: '确认开始执行' }));
  const retry = await screen.findByRole('button', { name: '重试同一执行操作' });
  expect(screen.getByLabelText('操作依据')).toBeDisabled();
  fireEvent.click(retry); await screen.findByRole('button', { name: '提交交付' });
  expect(posts).toHaveLength(2); expect(posts[0]).toBe(posts[1]);
});
it('requires a refresh after conflicts even after the editor is closed', async () => {
  value.snapshot = { ...emptyExecution, owner }; conflict = true;
  render(<TaskExecution {...props()} />);
  fireEvent.click(await screen.findByRole('button', { name: '开始执行' })); await reason();
  fireEvent.click(screen.getByRole('button', { name: '确认开始执行' })); await screen.findByText('相关依据已经变化');
  expect(screen.getByLabelText('操作依据')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '关闭执行操作' }));
  expect(screen.getByRole('button', { name: '开始执行' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '刷新执行记录' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '开始执行' })).toBeEnabled());
});
it('shows a historical revision read-only and never carries its state into a new revision', async () => {
  value.is_current = false; value.snapshot = { ...emptyExecution, status: 'accepted', owner };
  const view = render(<TaskExecution {...props()} readOnly />);
  await screen.findByText(/此处仅查看修订 1/);
  expect(screen.queryByRole('button', { name: '安排负责人 / 截止时间' })).toBeNull();
  value = execution({ revision: 2, revision_id: '2'.repeat(32) }); events = [];
  view.rerender(<TaskExecution {...props()} />);
  await screen.findByText('待安排'); expect(posts).toHaveLength(0);
});
it('loads every history page and rejects gaps instead of skipping entries', async () => {
  value = execution({ version: 21 }); events = Array.from({ length: 21 }, (_, index) => executionEvent(21 - index, value.snapshot));
  render(<TaskExecution {...props()} />);
  const more = await screen.findByRole('button', { name: '继续读取执行记录' });
  expect(screen.queryByText('第1次核对本修订的执行与交付')).toBeNull();
  fireEvent.click(more); await screen.findByText('第1次核对本修订的执行与交付');
  expect(screen.queryByRole('button', { name: '继续读取执行记录' })).toBeNull();
  vi.mocked(fetch).mockResolvedValueOnce(response({ action_id: actionId, revision: 1, revision_id: value.revision_id, events: [executionEvent(4, value.snapshot)], next_before: null }));
  await expect(readEvents(project, actionId, 1, value.revision_id, 5)).rejects.toThrow('执行历史分页不一致');
  vi.mocked(fetch).mockResolvedValueOnce(response({ action_id: actionId, revision: 1, revision_id: value.revision_id, events: [executionEvent(5, value.snapshot)], next_before: null }));
  await expect(readEvents(project, actionId, 1, value.revision_id, 5)).rejects.toThrow('执行历史分页不一致');
});
it('limits ordinary members to self-assignment and prevents review by the assigned member', async () => {
  value = execution({ can_manage: false, can_review: false });
  render(<TaskExecution {...props()} />); await screen.findByText('待安排');
  fireEvent.click(screen.getByRole('button', { name: '安排负责人 / 截止时间' }));
  const select = screen.getByLabelText('负责人', { selector: 'select' });
  expect(within(select).queryByRole('option', { name: /陈宁/ })).toBeNull();
  fireEvent.change(select, { target: { value: 'user' } }); await reason();
  fireEvent.click(screen.getByRole('button', { name: '保存安排' })); await screen.findByText('林悦 · 负责人');
  fireEvent.click(screen.getByRole('button', { name: '开始执行' })); await reason();
  fireEvent.click(screen.getByRole('button', { name: '确认开始执行' }));
  fireEvent.click(await screen.findByRole('button', { name: '提交交付' }));
  fireEvent.change(screen.getByLabelText('交付类型'), { target: { value: 'manual_record' } });
  fireEvent.change(screen.getByLabelText('交付标题'), { target: { value: '我方材料范围核实记录' } });
  fireEvent.change(screen.getByLabelText('核实记录（至少5字）'), { target: { value: '确认本次修订的版本与适用范围' } });
  await reason(); fireEvent.click(screen.getByRole('button', { name: '提交交付，等待验收' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '验收本次交付' })).toBeDisabled());
});
it('does not allow execution or acceptance with invalid approval or read-only permission', async () => {
  value = execution({ plan_approval_valid: false, snapshot: { ...emptyExecution, owner } });
  const view = render(<TaskExecution {...props()} />);
  await screen.findByText(/当前计划尚未批准/);
  expect(screen.getByRole('button', { name: '开始执行' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '准备材料' })).toBeEnabled();
  value = execution({ revision: 2, revision_id: '2'.repeat(32), can_write: false, can_manage: false, can_review: false });
  view.rerender(<TaskExecution {...props()} />); await screen.findByText('待安排');
  expect(screen.getByRole('button', { name: '安排负责人 / 截止时间' })).toBeDisabled();
});
