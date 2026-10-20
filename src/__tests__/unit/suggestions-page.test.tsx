// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('auditId=12'), useRouter: () => ({ replace: vi.fn() }), usePathname: () => '/suggestions' }));
vi.mock('@/components/project/project-context', () => ({ useProject: () => ({ projects: [{ id: 'p1' }], openWizard: vi.fn() }) }));
vi.mock('@/components/project/use-project-id', () => ({ useProjectId: () => ({ projectId: 'p1', loading: false }) }));
vi.mock('@/components/dashboard/use-section-fetch', () => ({ useSectionFetch: vi.fn() }));
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { AnalysisWorkspacePage } from '@/components/visibility/analysis-workspace-page';
const SuggestionsPage = () => <AnalysisWorkspacePage view="suggestions" />;
const InsightsPage = () => <AnalysisWorkspacePage view="insights" />;
const base = { schema: 'citation-workspace-1', project_id: 'p1', enabled: true, audits: [{ id: '12', status: 'completed', created_at: '2026-10-15' }], selected_audit_id: '12', latest_audit_id: '12', processing: false, can_act: false, can_review: false,
  report: { schema: 'citation-report-1', project_id: 'p1', audit_id: '12', run_id: 'run12', status: 'ready', snapshot_current: true, platforms: [{ platform: 'qwen' }, { platform: 'deepseek' }], diagnoses: [{ id: 'd1', record_id: 'd1', platform: 'qwen', finding: 'Qwen独立观察', response_ids: ['r1'] }, { id: 'd2', record_id: 'd2', platform: 'deepseek', finding: 'DeepSeek独立观察', response_ids: ['r2'] }], evidence: [], sources: [] } };
function response(data: unknown, locked = false) { vi.mocked(useSectionFetch).mockReturnValue({ data, locked, loading: false, error: false, refetch: vi.fn() } as never); }
afterEach(cleanup);
beforeEach(() => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ actions: [] }) })); });
describe('audit-scoped insight and suggestion pages', () => {
  it('keeps subscription gating explicit', () => {
    response(null, true); render(<SuggestionsPage />);
    expect(screen.getByText('订阅套餐后即可使用')).toBeTruthy();
    expect(screen.queryByText('行动计划')).toBeNull();
  });
  it('filters diagnoses and action choices by platform and blocks read-only mutation', () => {
    response({ ...base, view: 'suggestions' }); render(<SuggestionsPage />);
    fireEvent.change(screen.getByLabelText('分析平台'), { target: { value: 'qwen' } });
    expect(screen.getAllByText(/Qwen独立观察/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/DeepSeek独立观察/)).toBeNull();
    const create = screen.getByText('创建行动计划') as HTMLButtonElement;
    expect(create.disabled).toBe(true); fireEvent.click(create);
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
    expect(useSectionFetch).toHaveBeenCalledWith('/api/integration/analysis-workspace?projectId=p1&view=suggestions&auditId=12');
  });
  it('retains shared-snapshot platform associations and unregistered entity quotes', () => {
    response({ ...base, view: 'insights', observations: { prompt_platforms: [], claims: [], mentions: [{ id: 'm1', entity_id: 'e1', entity_name: '新发现品牌', owner_kind: 'snapshot', owner_id: 's1', quote: '新发现品牌的原文观点', sentiment: 'unknown', contexts: [{ platform: 'qwen', response_id: 'r1', source_id: 'c1', kind: 'answer_reference' }, { platform: 'deepseek', response_id: 'r2', source_id: 'c2', kind: 'search_candidate' }] }] } });
    render(<InsightsPage />);
    expect(screen.getByText('新发现品牌的原文观点')).toBeTruthy();
    expect(screen.getByText((_text, element) => element?.tagName === 'P' && /实际引用.*检索候选/.test(element.textContent || ''))).toBeTruthy();
    fireEvent.change(screen.getByLabelText('分析平台'), { target: { value: 'deepseek' } });
    expect(screen.getByText((_text, element) => element?.tagName === 'P' && /检索候选.*卡片 c2/.test(element.textContent || ''))).toBeTruthy();
    expect(screen.queryByText((_text, element) => element?.tagName === 'P' && /实际引用.*卡片 c1/.test(element.textContent || ''))).toBeNull();
  });
  it('rejects unrelated audit snapshots', () => {
    response({ ...base, selected_audit_id: '11', view: 'suggestions' }); render(<SuggestionsPage />);
    expect(screen.getByRole('alert')).toBeTruthy(); expect(screen.queryByText('行动计划')).toBeNull();
  });
});
