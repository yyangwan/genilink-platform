// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/trends' }));
vi.mock('@/components/project/project-context', () => ({ useProject: () => ({ projects: [{ id: 'p1' }], openWizard: vi.fn() }) }));
vi.mock('@/components/project/use-project-id', () => ({ useProjectId: () => ({ projectId: 'p1', loading: false }) }));
vi.mock('@/components/dashboard/use-section-fetch', () => ({ useSectionFetch: vi.fn() }));
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { MeasurementHistoryPage as TrendsPage } from '@/components/visibility/measurement-history-page';
const data = { schema: 'citation-measurement-history-1', project_id: 'p1', enabled: true, selected_cohort_id: 'c1', cohorts: [{ id: 'c1', title: '固定方案', expected_samples: 60 }], history_days: 365, results: [{ id: 'result1', created_at: '2026-10-15', snapshot_current: false, baseline_run_id: 'base', followup_run_id: 'follow', baseline_audit_id: '1', followup_audit_id: '2', entities: [{ id: 'e1', name: '新发现主体' }], platforms: ['qwen', 'deepseek'].map(platform => ({ platform, status: 'valid_comparison', expected_samples: 60, prompt_clusters: 20, included: [], excluded: [], out_of_cohort: [], metrics: [{ entity_id: 'e1', metric: 'answer_presence', baseline: { numerator: 1, denominator: 10 }, followup: { numerator: 3, denominator: 10 }, difference: 0.2, interval95: [0.1, 0.3], descriptive: { baseline: { numerator: 1, denominator: 10 }, followup: { numerator: 3, denominator: 10 } } }] })) }] };
function response(value: unknown, locked = false) { vi.mocked(useSectionFetch).mockReturnValue({ data: value, loading: false, error: false, locked, refetch: vi.fn() } as never); }
afterEach(cleanup);
describe('fixed-cohort trend reader', () => {
  it('shows exact baseline/followup and independent platforms while withholding stale deltas', () => {
    response(data); render(<TrendsPage />);
    expect(screen.getByText('基线审计 #1 → 复测审计 #2')).toBeTruthy();
    expect(screen.getAllByText('不输出变化结论')).toHaveLength(2);
    expect(screen.queryByText(/20.0个百分点/)).toBeNull();
    fireEvent.change(screen.getByLabelText('复测平台'), { target: { value: 'qwen' } });
    expect(screen.getAllByText('新发现主体')).toHaveLength(1);
    expect(screen.getByText('查看复测审计当前报告').closest('a')?.getAttribute('href')).toBe('/audits/2/report?project=p1');
    expect(useSectionFetch).toHaveBeenCalledWith('/api/integration/measurement-history?projectId=p1');
  });
  it('keeps a selected empty new scheme explicit without generating or showing old results', () => {
    response({ ...data, results: [] }); render(<TrendsPage />);
    expect(screen.getByText(/本方案尚无已保存的观测对比/)).toBeTruthy();
    expect(screen.queryByText(/基线审计 #1/)).toBeNull();
  });
  it('rejects cross-project data and respects subscriptions', () => {
    response({ ...data, project_id: 'p2' }); const { unmount } = render(<TrendsPage />);
    expect(screen.getByRole('alert')).toBeTruthy(); unmount();
    response(null, true); render(<TrendsPage />); expect(screen.getByText('订阅套餐后即可使用')).toBeTruthy();
  });
});
