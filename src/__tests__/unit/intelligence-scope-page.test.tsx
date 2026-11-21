// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', async () => {
  const { useMemo, useSyncExternalStore } = await import('react');
  const subscribe = (cb: () => void) => { window.addEventListener('navigation', cb); window.addEventListener('popstate', cb); return () => { window.removeEventListener('navigation', cb); window.removeEventListener('popstate', cb); }; };
  return { useRouter: () => navigation, useSearchParams: () => { const value = useSyncExternalStore(subscribe, () => window.location.search); return useMemo(() => new URLSearchParams(value), [value]); } };
});
vi.mock('@/components/project/project-context', () => ({ useProject: () => ({ currentProjectId: 'test-project' }) }));
vi.mock('next/link', () => ({ default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a> }));
import IntelligencePage from '@/app/(dashboard)/intelligence/page';
import { analysisRun, analysisOpportunities } from '../fixtures/analysis-scope';
import { project, runId } from '../fixtures/task-workspace';
import { readTaskScope } from '@/lib/visibility/task-view';
import { sourcePage, observation } from '../fixtures/source-observations';
import type { ComparisonReport } from '@/lib/visibility/comparison-workspace';
import type { VisibilityScore } from '@/lib/visibility/v4-audit';

let newer: ReturnType<typeof analysisRun>, requests: Array<{ url: string; method?: string }>;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const firstQuestion = '4'.repeat(32), secondQuestion = '6'.repeat(32);
function comparisonFixture(params: URLSearchParams): ComparisonReport {
  const run = analysisRun();
  const targets = run.summary.brand_presence!.targets.map(row => ({ ...row, identity_method: 'confirmed' }));
  const questions = [run.responses[0], run.responses[2]].map((row, index) => ({
    id: index ? secondQuestion : firstQuestion, prompt: row.prompt, prompt_hash: row.prompt_hash,
    scenario: index ? 'cost' : 'implementation', scope: 'eligible', platforms: ['qwen', 'doubao'],
  }));
  const score = (value: number): VisibilityScore => ({ value, no_score_reason: null });
  const base = { run_id: run.id, audit_id: run.audit_id, revision: run.revision, targets, questions };
  if (params.get('mode') === 'brands') return { ...base, brands: {
    rule_version: 'v4', own_target_id: 'registry:own', comparison_target_id: 'entity:rival', observations_available: true,
    own: score(63), pair: { count: 1, own: score(60), other: score(78) }, coverage: { planned: 2, received: 1 },
    matrices: { platform: [], scenario: [] },
    gaps: [{ question_id: firstQuestion, platform: 'qwen', gap: 18, own_response_id: 'b'.repeat(32) }],
    brands: targets.map(row => ({ ...row, answer_count: 1, recommended_count: 1, platforms: ['qwen'], score: score(60) })),
  } };
  const second = params.get('question') === secondQuestion;
  return { ...base, detail: {
    question: questions[second ? 1 : 0],
    samples: [{ sample_id: 'first', platform: 'qwen', response_id: (second ? '6' : 'b').repeat(32),
      status: 'received', search_mode: 'enabled', analysis_ready: true, findings: [], sources: second ? [] : [{
        id: 'source', title: '首题实施手册', url: 'https://example.com/manual', domain: 'example.com', content_type: 'documentation',
        family_id: null, snapshot_id: null, fetch_status: 'pending', snippet: null, ordinal: 1,
        frozen: false, anchor: false, evidence: [],
      }] }, { sample_id: 'missing', platform: 'doubao', response_id: null, status: 'failed', search_mode: null, findings: [], sources: [] }],
  } };
}
beforeEach(() => {
  vi.clearAllMocks(); requests = []; newer = { ...analysisRun(), id: 'f'.repeat(32), revision: 4 };
  window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [] }, '', `/intelligence?project=${project}&runId=${runId}&ownTarget=registry%3Aown&compareTarget=entity%3Arival&platform=qwen&scenario=implementation&view=overview&priority=current&actionId=old-action`);
  const replaceState = window.history.replaceState.bind(window.history);
  // Match Next's history bridge: its own router entries bypass URL notifications.
  // useSearchParams does not subscribe to our custom task-scope event.
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
    replaceState({ ...data, __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: [] }, unused, url);
    if (!data?.__NA && !data?._N) window.dispatchEvent(new Event('navigation'));
  });
  navigation.replace.mockImplementation((url: string) => { window.history.replaceState({}, '', url); window.dispatchEvent(new Event('navigation')); });
  navigation.push.mockImplementation(navigation.replace);
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    requests.push({ url: input, method: init?.method });
    const p = new URL(input, 'http://localhost').searchParams, op = p.get('op');
    if (op === 'opportunities') { const items = analysisOpportunities(); return response({ version: 'opportunities-v1', status: 'evaluated', can_write: true, items, total: items.length, next_offset: null, ranking_scope: p.get('priority'), policy: { version: 'policy-v1' } }); }
    if (op === 'plans') return response({ actions: [] });
    if (op === 'sourceObservations') return response(sourcePage([observation({ response_id: 'b'.repeat(32), platform: 'qwen' })]));
    if (p.get('view') === 'detail') return response(p.get('runId') === runId ? analysisRun() : newer);
    if (p.get('view') === 'comparison') return response(comparisonFixture(p));
    if (p.get('view') === 'capture' || p.get('view') === 'captureV4') return response({ audit_id: '99', status: 'completed', expected_samples: 3, sealed: 3, failed: 0, source_pending: 0, analysis_pending: 0, refresh_pending: false, published_run_id: runId });
    return response({ enabled: true, runs: [analysisRun(), newer] });
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('enters exactly the overview opportunity evidence and task without losing scope or keeping an unrelated action', async () => {
  render(<IntelligencePage />);
  fireEvent.click(await screen.findByRole('button', { name: '核对这项机会的证据 →' }));
  const evidence = await screen.findByRole('region', { name: '所选机会的原始证据' });
  await within(evidence).findByText('锐川原文保留总部与门店边界及版本限制。');
  expect(readTaskScope(project)).toMatchObject({ own: 'registry:own', comparison: 'entity:rival', platform: 'qwen', scenario: 'implementation', opportunity: 'd'.repeat(64), action: '' });
  expect(new URLSearchParams(window.location.search).get('priority')).toBe('current');
  fireEvent.click(within(evidence).getByRole('button', { name: '返回对应任务 →' }));
  const task = await screen.findByRole('region', { name: '当前具体任务' });
  expect(task).toHaveTextContent('补齐我方门店权限与实施边界说明');
  expect(screen.queryByLabelText('行动自有品牌')).toBeNull();
  expect(screen.getByLabelText('对比品牌')).toHaveValue('entity:rival');
  expect(requests.every(row => !row.method)).toBe(true);
});

it('preserves scope across platform/source tabs and highlights a platform without hiding its peers', async () => {
  render(<IntelligencePage />); await screen.findByRole('region', { name: '本次优化机会' });
  await waitFor(() => expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('60'));
  fireEvent.click(screen.getByRole('button', { name: /平台差异对照/ }));
  await screen.findByText('问题与样本');
  expect(screen.getByLabelText('重点平台')).toHaveValue('qwen');
  expect(document.querySelectorAll('.comparison-card')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('重点平台'), { target: { value: 'doubao' } });
  await waitFor(() => expect(document.querySelector('.comparison-focused')?.textContent).toContain('豆包'));
  fireEvent.click(screen.getByRole('button', { name: /来源文章库/ }));
  await screen.findByText(/本页保留所选平台与场景的全部来源/);
  expect(screen.queryByLabelText('筛选来源平台')).toBeNull();
  expect(readTaskScope(project)).toMatchObject({ own: 'registry:own', comparison: 'entity:rival', platform: 'doubao', scenario: 'implementation' });
  expect(screen.getByLabelText('需求场景')).toHaveValue('implementation');
});

it('drills into the exact question and clears prior citations and actions when switching questions', async () => {
  render(<IntelligencePage />);
  await screen.findByRole('region', { name: '本次优化机会' });
  fireEvent.click(screen.getByRole('button', { name: /品牌发现对比/ }));
  fireEvent.click(await screen.findByRole('button', { name: /查看同题推荐依据/ }));
  await screen.findByText('首题实施手册');
  expect(screen.getByLabelText('对照提示词')).toHaveValue(firstQuestion);
  expect(screen.getByLabelText('对比品牌')).toHaveValue('entity:rival');
  expect(await screen.findByRole('button', { name: '查看具体任务 →' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /核对引用/ }));
  const drawer = await screen.findByRole('dialog', { name: '首题实施手册' });
  expect(drawer).toHaveTextContent('冻结正文尚不可核对');
  fireEvent.click(within(drawer).getByRole('button', { name: '关闭引用依据' }));
  fireEvent.change(screen.getByLabelText('对照提示词'), { target: { value: secondQuestion } });
  await screen.findByText('该题暂无可核对的实际引用。');
  expect(screen.queryByText('首题实施手册')).toBeNull();
  expect(screen.queryByRole('button', { name: '查看具体任务 →' })).toBeNull();
  expect(new URLSearchParams(window.location.search).get('question')).toBe(secondQuestion);
});

it('updates all four dropdowns and the displayed score through the Next history bridge without refetching the run', async () => {
  const normal = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((input, init) => {
    if (String(input).includes('view=detail')) {
      const run = analysisRun();
      run.summary.brand_presence!.targets.find(row => row.target_id === 'entity:new')!.role = 'own';
      return Promise.resolve(response(run));
    }
    return normal(input, init);
  });
  render(<IntelligencePage />);
  await waitFor(() => expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('60'));
  const detailRequests = () => requests.filter(row => row.url.includes('view=detail')).length;
  const before = detailRequests();
  fireEvent.change(screen.getByLabelText('自有品牌'), { target: { value: 'entity:new' } });
  await waitFor(() => expect(screen.getByLabelText('自有品牌')).toHaveValue('entity:new'));
  expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('80');
  fireEvent.change(screen.getByLabelText('对比品牌'), { target: { value: 'registry:own' } });
  await waitFor(() => expect(screen.getByLabelText('对比品牌')).toHaveValue('registry:own'));
  fireEvent.change(screen.getByLabelText('目标平台'), { target: { value: 'doubao' } });
  await waitFor(() => expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('50'));
  fireEvent.change(screen.getByLabelText('需求场景'), { target: { value: 'cost' } });
  await waitFor(() => expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('—'));
  expect(readTaskScope(project)).toMatchObject({ own: 'entity:new', comparison: 'registry:own', platform: 'doubao', scenario: 'cost' });
  expect(detailRequests()).toBe(before);
  expect(requests.every(row => !row.method)).toBe(true);
});

it('switches revisions without discarding comparison scope, clears obsolete task IDs and retains invalid brands visibly', async () => {
  newer.summary.brand_presence!.targets = newer.summary.brand_presence!.targets.filter(row => row.target_id !== 'entity:rival');
  render(<IntelligencePage />); fireEvent.click(await screen.findByRole('button', { name: '查看具体任务 →' }));
  await screen.findByRole('region', { name: '当前具体任务' });
  fireEvent.change(screen.getByLabelText('分析版本'), { target: { value: newer.id } });
  await screen.findByText(/原比较对象失效或与自有品牌相同/);
  expect(readTaskScope(project)).toMatchObject({ comparison: 'entity:rival', platform: 'qwen', scenario: 'implementation', opportunity: '', action: '' });
  expect(screen.getByLabelText('对比品牌')).toHaveValue('entity:rival');
  expect(screen.queryByRole('region', { name: '当前具体任务' })).toBeNull();
  expect(screen.queryByRole('button', { name: '查看具体任务 →' })).toBeNull();
});

it('responds to URL/back navigation immediately instead of showing a previously loaded run under a new URL', async () => {
  render(<IntelligencePage />); await screen.findByRole('button', { name: '查看具体任务 →' });
  await act(async () => { window.history.replaceState({}, '', `/intelligence?project=${project}&runId=${newer.id}&view=overview&ownTarget=registry%3Aown&platform=doubao&scenario=cost`); window.dispatchEvent(new Event('popstate')); });
  await waitFor(() => expect(screen.getByLabelText('分析版本')).toHaveValue(newer.id));
  await waitFor(() => expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('—'));
  expect(screen.getByLabelText('目标平台')).toHaveValue('doubao');
});

it('does not republish the same run and erase an opportunity when returning to overview from an active audit', async () => {
  window.history.replaceState({}, '', '/intelligence?project=' + project + '&auditId=99&view=overview');
  render(<IntelligencePage />);
  fireEvent.click((await screen.findAllByRole('button', { name: '核对这项机会的证据 →' }))[0]);
  await screen.findByRole('region', { name: '所选机会的原始证据' });
  fireEvent.click(screen.getByRole('button', { name: /审计洞察/ }));
  await screen.findByRole('region', { name: '本次优化机会' });
  fireEvent.change(screen.getByLabelText('目标平台'), { target: { value: 'qwen' } });
  await waitFor(() => expect(readTaskScope(project).opportunity).toBe('d'.repeat(64)));
  expect(new URLSearchParams(window.location.search).get('runId')).toBe(runId);
});

it('does not let an aborted older detail response replace a newer selected run', async () => {
  const normal = vi.mocked(fetch).getMockImplementation()!;
  let finish!: (value: Response) => void;
  vi.mocked(fetch).mockImplementation((input, init) => String(input).includes('view=detail') && String(input).includes(`runId=${runId}`)
    ? new Promise<Response>(done => { finish = done; }) : normal(input, init));
  render(<IntelligencePage />); await waitFor(() => expect(finish).toBeTypeOf('function'));
  await act(async () => { window.history.replaceState({}, '', `/intelligence?project=${project}&runId=${newer.id}&view=overview&ownTarget=registry%3Aown&platform=doubao&scenario=implementation`); window.dispatchEvent(new Event('popstate')); });
  await waitFor(() => expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('30'));
  await act(async () => { finish(response(analysisRun())); });
  expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('30');
  expect(screen.getByLabelText('分析版本')).toHaveValue(newer.id);
});
