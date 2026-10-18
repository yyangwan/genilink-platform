// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace }) }));
vi.mock('@/components/project/project-context', () => ({ useProject: () => ({ currentProjectId: 'p1', projects: [], loading: false, openWizard: vi.fn() }) }));
vi.mock('@/components/visibility/use-visibility-dashboard', () => ({ useVisibilityDashboard: vi.fn() }));
import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import VisibilityPage from '@/app/(dashboard)/visibility/page';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('explicit capture from visibility page', () => {
  it('only reads prompts until the user starts the capture-v2 flow', async () => {
    const refetch = vi.fn();
    vi.mocked(useVisibilityDashboard).mockReturnValue({ data: { schema: 'citation-dashboard-1', project_id: 'p1', enabled: true, processing: false, latest_audit: null, report: null, can_capture: true }, loading: false, error: false, locked: false, refetch });
    const fetcher = vi.fn().mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === 'POST' ? { audit_id: '12' } : [{ id: 1, text: '有哪些方案' }])));
    vi.stubGlobal('fetch', fetcher);
    render(<VisibilityPage />);
    await waitFor(() => expect((screen.getByText('开始多轮采集') as HTMLButtonElement).disabled).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toContain('view=prompts');
    fireEvent.click(screen.getByText('开始多轮采集'));
    await screen.findByText(/已创建采集任务 #12/);
    expect(replace).toHaveBeenCalledWith('/visibility?project=p1&auditId=12', { scroll: false });
    expect(screen.getByRole('link', { name: '查看任务详情' }).getAttribute('href')).toBe('/intelligence?project=p1&auditId=12');
    expect(screen.getByRole('button', { name: '采集设置' }).getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: '采集设置' }));
    expect(screen.getByRole('button', { name: '新建另一次采集' })).toBeTruthy();
    expect(fetcher.mock.calls[1][0]).toBe('/api/integration/intelligence');
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ action: 'capture', projectId: 'p1', promptIds: [1], rounds: 3 });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty('surface');
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
