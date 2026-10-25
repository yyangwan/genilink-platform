// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { TaskFactSelector } from '@/components/visibility/task-fact-selector';
import { DraftBriefs } from '@/components/visibility/draft-briefs';
import { loadEligibleFacts } from '@/lib/visibility/fact-reader';
import { actionId, plan, project, run, runId, taskPack } from '../fixtures/task-workspace';
import { factId, factPage } from '../fixtures/task-facts';
vi.mock('@/components/visibility/manual-content-tasks', () => ({ ManualContentTasks: () => null }));
vi.mock('@/components/visibility/evidence-draft-execution', () => ({ EvidenceDraftExecution: ({ approvalId }: { approvalId: string }) => <p>待验证授权 {approvalId}</p> }));
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
let page: ReturnType<typeof factPage>;
beforeEach(() => {
  page = factPage();
  window.history.replaceState({}, '', `/?project=${project}&runId=${runId}&view=drafts&actionId=${actionId}`);
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => response(page)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('requires an explicit fact choice and scope review before proposing a new immutable revision', async () => {
  const save = vi.fn();
  render(<TaskFactSelector projectId={project} plan={plan()} locked={false} conflict={false} error="" uncertain={false} onClose={vi.fn()} onRetry={vi.fn()} onSave={save} />);
  await screen.findByText(page.items[0].statement!);
  const choices = screen.getAllByRole('checkbox');
  expect(choices[0]).not.toBeChecked();
  fireEvent.click(choices[0]);
  fireEvent.change(screen.getByLabelText('本次事实选择依据'), { target: { value: '专业版范围与本次实施问题相符' } });
  expect(screen.getByRole('button', { name: '保存新修订，重新审核' })).toBeDisabled();
  fireEvent.click(choices[1]); fireEvent.click(screen.getByRole('button', { name: '保存新修订，重新审核' }));
  expect(save).toHaveBeenCalledWith([factId], '专业版范围与本次实施问题相符');
});
it('allows removal of a selected withdrawn fact and blocks a changed action version', async () => {
  page.items[0] = { ...page.items[0], selected: true, eligible: false, status: 'withdrawn' };
  const p = plan({ target: { ...plan().target, task_pack: { ...taskPack(), own_fact_ids: [factId] } } });
  const props = { projectId: project, plan: p, locked: false, conflict: false, error: '', uncertain: false, onClose: vi.fn(), onRetry: vi.fn(), onSave: vi.fn() };
  const view = render(<TaskFactSelector {...props} />);
  await screen.findByText('已撤回'); const choice = screen.getAllByRole('checkbox')[0];
  expect(choice).toBeEnabled(); fireEvent.click(choice); expect(choice).toBeDisabled();
  view.rerender(<TaskFactSelector {...props} conflict />);
  expect(screen.getByLabelText('本次事实选择依据')).toBeDisabled();
});
it('rejects mixed projection pages rather than silently discarding later facts', async () => {
  const first = { ...page, total: 2, next_offset: 1 };
  vi.mocked(fetch).mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response({ ...page, projection_hash: '6'.repeat(64), total: 2, items: [{ ...page.items[0], id: 'other' }] }));
  await expect(loadEligibleFacts(project, actionId, 1, '1'.repeat(32))).rejects.toThrow('事实资格已变化');
});
it('loads exact task facts and approval version automatically, retries the identical authorization after uncertainty', async () => {
  const p = plan({ approval_valid: true, target: { ...plan().target, task_pack: { ...taskPack(), own_fact_ids: [factId] } } });
  const posts: string[] = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (init?.method === 'POST') { posts.push(String(init.body)); if (posts.length === 1) throw Error('timeout'); return response({ approval_id: 'e'.repeat(32), version: 5 }, 202); }
    const q = new URL(String(input), 'http://localhost').searchParams;
    if (q.get('op') === 'detail') return response(p);
    if (q.get('op') === 'plans') return response({ actions: [p] });
    if (q.get('op') === 'eligibleFacts') return response(page);
    if (q.get('op') === 'draftApprovals') return response({ schema_version: 3, action_id: actionId, revision: 1, revision_id: p.revision_id, latest_version: 4, approval_id: null, bound_to_current_revision: false, can_authorize: true, authorization_state: 'not_verified' });
    return response({ schemaVersion: 3, enabled: true, generateDraft: { enabled: true, channels: ['wechat'] }, manualTask: { enabled: true, channels: ['website'] } });
  });
  render(<DraftBriefs run={run} projectId={project} />);
  await screen.findByText(/内容授权版本 4/);
  expect(screen.queryByLabelText('草稿审批版本')).toBeNull();
  fireEvent.change(screen.getByLabelText('草稿审批截止'), { target: { value: '2030-01-01T12:00' } });
  fireEvent.change(screen.getByLabelText('草稿审批理由'), { target: { value: '核对专业版范围，开展原问题内容实验' } });
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: '批准本修订的内容材料' }));
  await screen.findByRole('button', { name: '重试同一授权操作' });
  expect(screen.getByLabelText('草稿审批理由')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '重试同一授权操作' }));
  await waitFor(() => expect(posts).toHaveLength(2)); expect(posts[0]).toBe(posts[1]);
  expect(JSON.parse(posts[0])).toMatchObject({ expectedVersion: 4, expectedRevision: 1, factsScopeReviewed: true, factIds: [factId] });
  await screen.findByText('待验证授权 ' + 'e'.repeat(32));
});
