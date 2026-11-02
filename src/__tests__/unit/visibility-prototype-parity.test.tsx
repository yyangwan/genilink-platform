// @vitest-environment jsdom
import { useMemo, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { CitationDashboard } from '@/types/citation-dashboard';
import { analysisRun } from '../fixtures/analysis-scope';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  useSearchParams: () => {
    const search = useSyncExternalStore(callback => {
      window.addEventListener('navigation', callback);
      return () => window.removeEventListener('navigation', callback);
    }, () => window.location.search);
    return useMemo(() => new URLSearchParams(search), [search]);
  },
}));
vi.mock('@/components/project/project-context', () => ({ useProject: () => ({ currentProjectId: 'p1', projects: [], loading: false, openWizard: vi.fn() }) }));
vi.mock('@/components/visibility/use-visibility-dashboard', () => ({ useVisibilityDashboard: vi.fn() }));
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import VisibilityPage from '@/app/(dashboard)/visibility/page';
import { CaptureProgress } from '@/components/visibility/capture-progress';

const run = analysisRun();
const empty: CitationDashboard = { schema: 'citation-dashboard-1', project_id: 'p1', enabled: true, can_capture: true, processing: false, latest_audit: null, report: null };
const saved: CitationDashboard = { ...empty, latest_audit: { id: run.audit_id, status: 'completed', stage: 'done', created_at: '', platforms: ['qwen'] }, report: { schema: 'citation-report-1', project_id: 'p1', audit_id: run.audit_id, run_id: run.id, revision: run.revision, status: 'partial', snapshot_current: true, coverage: run.coverage, analysis_scope: { id: run.id, audit_id: run.audit_id, revision: run.revision, targets: run.summary.brand_presence!.targets, platforms: [...new Set(run.responses.map(row => row.platform))] } } };
function dashboard(data: CitationDashboard) { vi.mocked(useVisibilityDashboard).mockReturnValue({ data, loading: false, error: false, locked: false, refetch: vi.fn() }); }
beforeEach(() => {
  window.history.replaceState({ __NA: true }, '', '/visibility?project=p1');
  const replace = window.history.replaceState.bind(window.history);
  vi.spyOn(window.history, 'replaceState').mockImplementation((data, unused, url) => {
    replace({ ...data, __NA: true }, unused, url);
    if (!data?.__NA) window.dispatchEvent(new Event('navigation'));
  });
  vi.stubGlobal('fetch', vi.fn(async input => {
    const params = new URL(String(input), 'http://localhost').searchParams;
    if (params.get('view') === 'detail') throw new Error('Capture must not download the full run');
    if (params.get('view') === 'capture') return Response.json({ audit_id: run.audit_id, status: 'completed', expected_samples: 3, sealed: 3, failed: 0, source_pending: 0, analysis_pending: 0, refresh_pending: false, published_run_id: run.id, analysis_status: 'partial', samples: [] });
    return Response.json([{ id: 1, text: '有哪些方案' }]);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shows the prototype launch and three idle stages without inventing analysis or starting capture', async () => {
  dashboard(empty);
  render(<VisibilityPage />);
  await screen.findByText('1 个提示词 × 5 个平台');
  expect(screen.getByRole('heading', { name: '发起一次采集，跟踪每个阶段' })).toBeInTheDocument();
  const task = screen.getByRole('region', { name: '当前采集任务' });
  expect(within(task).getByRole('heading', { name: '当前没有进行中的采集' })).toBeInTheDocument();
  expect(within(task).getAllByRole('progressbar')).toHaveLength(3);
  expect(screen.getAllByRole('combobox').every(select => (select as HTMLSelectElement).disabled)).toBe(true);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
});

it('preserves the comparison choices when entering insight and keeps capture scope independent', async () => {
  dashboard(saved);
  render(<VisibilityPage />);
  await waitFor(() => expect(screen.getByLabelText('自有品牌')).toHaveValue('registry:own'));
  fireEvent.change(screen.getByLabelText('对比品牌'), { target: { value: 'entity:rival' } });
  fireEvent.change(screen.getByLabelText('目标平台'), { target: { value: 'qwen' } });
  fireEvent.change(screen.getByLabelText('需求场景'), { target: { value: 'implementation' } });
  const link = screen.getByRole('link', { name: '进入审计洞察 →' });
  const params = new URL(link.getAttribute('href')!, 'http://localhost').searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ project: 'p1', auditId: run.audit_id, runId: run.id, ownTarget: 'registry:own', compareTarget: 'entity:rival', platform: 'qwen', scenario: 'implementation', view: 'overview' });
  expect(new URL(screen.getByRole('link', { name: '查看本次证据' }).getAttribute('href')!, 'http://localhost').searchParams.get('scenario')).toBe('implementation');
  expect(screen.getByText('1 个提示词 × 5 个平台')).toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
  expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes('view=detail'))).toBe(true);
  fireEvent.change(screen.getByLabelText('自有品牌'), { target: { value: '' } });
  await waitFor(() => expect(screen.getByLabelText('自有品牌')).toHaveValue(''));
});

it('rejects embedded scope for a different audit instead of displaying its brands', async () => {
  dashboard({ ...saved, report: { ...saved.report!, analysis_scope: { ...saved.report!.analysis_scope!, audit_id: '1000' } } });
  render(<VisibilityPage />);
  await screen.findByText('分析范围与当前审计不匹配，请刷新后重试。');
  expect(screen.getByLabelText('自有品牌')).toBeDisabled();
});

it('does not show an old character coverage bar as successful progress when the latest analysis failed', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ audit_id: run.audit_id, status: 'completed', expected_samples: 3, sealed: 3, failed: 0, source_pending: 0, analysis_pending: 0, refresh_pending: false, published_run_id: run.id, analysis_status: 'failed' }));
  render(<CaptureProgress collection projectId="p1" auditId={run.audit_id} report={saved.report} />);
  await screen.findByText('分析失败，尚未产出本次结果');
  expect(screen.queryByRole('progressbar', { name: '已发布修订的分析字符覆盖' })).toBeNull();
  expect(screen.getByRole('img', { name: '语义分析覆盖待确认' })).toBeInTheDocument();
});
