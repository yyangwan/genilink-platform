// @vitest-environment jsdom
import { useMemo, useSyncExternalStore } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
const current = {
  audit_id: run.audit_id, mode: 'v4', status: 'completed', published_run_id: run.id, poll_after_ms: null,
  platforms: [{ platform: 'qwen', planned: 1, received: 1, failed: 0, pending: 0 }],
  capture: { state: 'completed', planned: 1, received: 1, failed: 0, pending: 0 },
  archive: { state: 'settled', observed: 1, archived: 1 },
  analysis: { state: 'completed', attempt_no: 1, can_retry: false },
};
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
    if (params.get('view') === 'captureV4') return Response.json(current);
    if (params.get('view') === 'captureSamples') return Response.json({ items: [], next_cursor: null });
    return Response.json([{ id: 1, text: '有哪些方案' }]);
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('shows the v4 launch and an idle summary without starting any capture', async () => {
  dashboard(empty);
  render(<VisibilityPage />);
  await screen.findByText('1 个提示词 × 5 个平台');
  expect(screen.getByRole('heading', { name: '可见性分析' })).toBeInTheDocument();
  expect(screen.getByText('当前项目暂无采集记录。')).toBeInTheDocument();
  expect(screen.queryByLabelText('对比品牌')).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
});

it('keeps capture independent from comparison while preserving an insights link for the current audit', async () => {
  dashboard(saved);
  window.history.replaceState(null, '', `/visibility?project=p1&auditId=${run.audit_id}&compareTarget=entity%3Arival&platform=qwen`);
  render(<VisibilityPage />);
  const link = await screen.findByRole('link', { name: '查看审计洞察' });
  const params = new URL(link.getAttribute('href')!, 'http://localhost').searchParams;
  expect(Object.fromEntries(params)).toMatchObject({ project: 'p1', auditId: run.audit_id, runId: run.id, compareTarget: 'entity:rival', platform: 'qwen', view: 'overview' });
  expect(screen.queryByLabelText('目标平台')).not.toBeInTheDocument();
  expect(screen.getByLabelText('筛选采集平台')).toHaveValue('');
  expect(vi.mocked(fetch).mock.calls.every(([url, init]) => !init?.method && !String(url).includes('view=detail'))).toBe(true);
});

it('rejects a status result for a different audit instead of displaying its records', async () => {
  dashboard(saved);
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation((input, init) => String(input).includes('view=captureV4')
    ? Promise.resolve(Response.json({ ...current, audit_id: '1000' })) : original(input, init));
  render(<VisibilityPage />);
  await screen.findByText('返回的采集状态与当前审计不匹配。');
  expect(screen.queryByRole('region', { name: '原始采集记录' })).not.toBeInTheDocument();
});

it('does not show an old character coverage bar as successful progress when the latest analysis failed', async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ audit_id: run.audit_id, status: 'completed', expected_samples: 3, sealed: 3, failed: 0, source_pending: 0, analysis_pending: 0, refresh_pending: false, published_run_id: run.id, analysis_status: 'failed' }));
  render(<CaptureProgress collection projectId="p1" auditId={run.audit_id} report={saved.report} />);
  await screen.findByText('分析失败，尚未产出本次结果');
  expect(screen.queryByRole('progressbar', { name: '已发布修订的分析字符覆盖' })).toBeNull();
  expect(screen.getByRole('img', { name: '语义分析覆盖待确认' })).toBeInTheDocument();
});
