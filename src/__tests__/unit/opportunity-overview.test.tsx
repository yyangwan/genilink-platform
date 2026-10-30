// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { OpportunityOverview, SelectedOpportunityEvidence } from '@/components/visibility/opportunity-overview';
import { loadOpportunities } from '@/lib/visibility/opportunity-reader';
import { emptyTaskScope, readTaskScope } from '@/lib/visibility/task-view';
import { analysisRun, analysisOpportunities } from '../fixtures/analysis-scope';
import { fullText, opportunity, project, runId } from '../fixtures/task-workspace';
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const page = (items = analysisOpportunities(), extra = {}) => ({ version: 'opportunities-v1', status: 'evaluated', can_write: true, items, total: items.length, next_offset: null, ranking_scope: 'frozen', policy: { version: 'v1' }, ...extra });
const scope = { ...emptyTaskScope, own: 'registry:own', comparison: 'entity:rival', platform: 'qwen', scenario: 'implementation' };
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState({}, '', '/intelligence?project=' + project);
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
  vi.stubGlobal('fetch', vi.fn(async (input: string) => new URL(input, 'http://localhost').searchParams.get('view') === 'content' ? reply({ items: [{ id: 'c'.repeat(32), start: 0, end: Array.from(fullText).length, text: fullText }], next_offset: null }) : reply(page())));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const overview = (search = `project=${project}`, selection = scope) => <OpportunityOverview run={analysisRun()} projectId={project} scope={selection} search={search} onPreferences={vi.fn()} />;

it('waits for complete bounded pages before presenting filtered priority cards, and carries the exact run/opportunity', async () => {
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockResolvedValueOnce(reply(page([analysisOpportunities()[1]], { total: 2, next_offset: 1 }))).mockImplementationOnce(() => new Promise(done => { finish = done; }));
  render(overview()); await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('button', { name: '查看具体任务 →' })).toBeNull(); expect(screen.getByRole('status')).toHaveTextContent('完整机会');
  await act(async () => { finish(reply(page([opportunity()], { total: 2 }))); });
  fireEvent.click(await screen.findByRole('button', { name: '查看具体任务 →' }));
  expect(readTaskScope(project).opportunity).toBe(opportunity().id);
  expect(new URLSearchParams(window.location.search).get('runId')).toBe(runId);
});

it('does not join platform and scenario from different child observations into a false match', async () => {
  const row = opportunity({ subtargets: [{ ...opportunity().subtargets[0], scenario_id: 'cost' }, opportunity().subtargets[1]] });
  vi.mocked(fetch).mockResolvedValue(reply(page([row]))); render(overview());
  expect(await screen.findByText(/没有匹配当前范围的机会/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '查看具体任务 →' })).toBeNull();
});

it('keeps pending/unknown and deferred coverage visible without inventing a zero opportunity conclusion', async () => {
  vi.mocked(fetch).mockResolvedValue(reply(page([], { version: undefined, status: 'partial', deferred_task_count: 2 })));
  render(overview()); expect(await screen.findByText(/尚未生成可读取的机会分析/)).toHaveTextContent('2 项任务延后处理');
  expect(screen.queryByText('没有优化空间')).toBeNull();
});

it('retains current-preference scope in the URL and performs only read requests', async () => {
  vi.mocked(fetch).mockImplementation(async input => reply(page(undefined, { ranking_scope: new URL(String(input), 'http://localhost').searchParams.get('priority'), policy: { version: 'current-v2' } })));
  const view = render(overview()); await screen.findByRole('button', { name: '查看具体任务 →' });
  fireEvent.change(screen.getByLabelText('机会排序'), { target: { value: 'current' } });
  view.rerender(overview(window.location.search));
  expect(await screen.findByText(/策略版本：current-v2/)).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.at(-1)?.[0]).toContain('priority=current');
  expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method)).toBe(true);
});

it('preserves original evidence on an out-of-scope selection and reads the original Unicode excerpt', async () => {
  render(<SelectedOpportunityEvidence run={analysisRun()} projectId={project} scope={{ ...scope, comparison: 'entity:new', opportunity: opportunity().id }} onView={vi.fn()} />);
  expect(await screen.findByText(/原机会不属于当前比较范围/)).toBeInTheDocument();
  expect(screen.getByText('锐川原文保留总部与门店边界及版本限制。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '定位保存原文 →' }));
  await waitFor(() => expect(document.querySelector('mark')).toHaveTextContent(opportunity().task_pack!.diagnostic_evidence[0].quote));
  expect(String(vi.mocked(fetch).mock.calls.at(-1)?.[0])).toContain(`ownerId=${'b'.repeat(32)}`);
});

it('does not substitute the first opportunity for a missing selected ID', async () => {
  render(<SelectedOpportunityEvidence run={analysisRun()} projectId={project} scope={{ ...scope, opportunity: 'missing' }} onView={vi.fn()} />);
  expect(await screen.findByRole('status')).toHaveTextContent('未替换为第一条');
  expect(screen.queryByText(opportunity().finding)).toBeNull();
});

it('fails closed on repeated, skipped, shortened or changing opportunity pages', async () => {
  for (const second of [page([opportunity()], { total: 2 }), page([analysisOpportunities()[1]], { total: 3 }), page([], { total: 2 }), page([analysisOpportunities()[1]], { total: 2, policy: { version: 'changed' } })]) {
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(reply(page([opportunity()], { total: 2, next_offset: 1 }))).mockResolvedValueOnce(reply(second));
    await expect(loadOpportunities(project, runId, 'frozen', new AbortController().signal)).rejects.toThrow();
  }
});

it('ignores an older run request after a new run is selected', async () => {
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(done => { finish = done; })).mockResolvedValue(reply(page([])));
  const view = render(overview());
  view.rerender(<OpportunityOverview run={{ ...analysisRun(), id: 'f'.repeat(32) }} projectId={project} scope={scope} search={`project=${project}`} onPreferences={vi.fn()} />);
  await screen.findByText(/没有匹配当前范围的机会/); await act(async () => { finish(reply(page())); });
  expect(screen.queryByRole('button', { name: '查看具体任务 →' })).toBeNull();
  expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
});
