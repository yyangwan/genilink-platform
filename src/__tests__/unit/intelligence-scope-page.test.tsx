// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', async () => {
  const { useMemo, useSyncExternalStore } = await import('react');
  const subscribe = (cb: () => void) => { window.addEventListener('navigation', cb); window.addEventListener('popstate', cb); window.addEventListener('genilink-task-scope', cb); return () => { window.removeEventListener('navigation', cb); window.removeEventListener('popstate', cb); window.removeEventListener('genilink-task-scope', cb); }; };
  return { useRouter: () => navigation, useSearchParams: () => { const value = useSyncExternalStore(subscribe, () => window.location.search); return useMemo(() => new URLSearchParams(value), [value]); } };
});
vi.mock('@/components/project/project-context', () => ({ useProject: () => ({ currentProjectId: 'test-project' }) }));
vi.mock('next/link', () => ({ default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a> }));
import IntelligencePage from '@/app/(dashboard)/intelligence/page';
import { analysisRun, analysisOpportunities } from '../fixtures/analysis-scope';
import { project, runId } from '../fixtures/task-workspace';
import { readTaskScope } from '@/lib/visibility/task-view';
import { sourcePage, observation } from '../fixtures/source-observations';

let newer: ReturnType<typeof analysisRun>, requests: Array<{ url: string; method?: string }>;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => {
  vi.clearAllMocks(); requests = []; newer = { ...analysisRun(), id: 'f'.repeat(32), revision: 4 };
  window.history.replaceState({}, '', `/intelligence?project=${project}&runId=${runId}&ownTarget=registry%3Aown&compareTarget=entity%3Arival&platform=qwen&scenario=implementation&view=overview&priority=current&actionId=old-action`);
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
    if (p.get('view') === 'capture') return response({ audit_id: '99', status: 'completed', expected_samples: 3, sealed: 3, failed: 0, source_pending: 0, analysis_pending: 0, refresh_pending: false, published_run_id: runId });
    return response({ enabled: true, runs: [analysisRun(), newer] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

it('preserves all four scope choices across platform/source tabs and uses the same platform for scores', async () => {
  render(<IntelligencePage />); await screen.findByRole('region', { name: '本次优化机会' });
  await waitFor(() => expect(document.querySelector('.brand-score-conclusion > strong')).toHaveTextContent('60'));
  fireEvent.click(screen.getByRole('button', { name: /平台差异对照/ }));
  await screen.findByText('同一提示词');
  expect(screen.getByLabelText('目标平台')).toHaveValue('qwen');
  expect(document.querySelectorAll('.citation-platform-card')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('目标平台'), { target: { value: 'doubao' } });
  await waitFor(() => expect(document.querySelector('.citation-platform-card')?.textContent).toContain('豆包'));
  fireEvent.click(screen.getByRole('button', { name: /来源文章库/ }));
  await screen.findByText(/本页保留所选平台与场景的全部来源/);
  expect(screen.queryByLabelText('筛选来源平台')).toBeNull();
  expect(readTaskScope(project)).toMatchObject({ own: 'registry:own', comparison: 'entity:rival', platform: 'doubao', scenario: 'implementation' });
  expect(screen.getByLabelText('需求场景')).toHaveValue('implementation');
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
