// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const state = vi.hoisted(() => ({ projectId: 'p1', search: '', workbench: {} as Record<string, unknown> }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock('@/components/project/project-context', () => ({ useProject: () => ({ currentProject: { id: state.projectId, name: '项目' }, projects: [{ id: state.projectId }], openWizard: vi.fn() }) }));
vi.mock('@/components/project/use-project-id', () => ({ useProjectId: () => ({ projectId: state.projectId, loading: false }) }));
vi.mock('@/components/dashboard/use-section-fetch', () => ({ useSectionFetch: vi.fn() }));
vi.mock('@/components/visibility/manual-content-tasks', () => ({ ManualContentTasks: ({ readOnly }: { readOnly: boolean }) => <p>{readOnly ? '只读人工任务' : '人工任务列表'}</p> }));
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import ContentPage from '@/app/(dashboard)/content/page';
const approvalId = 'a'.repeat(32);
function material(status = 'ready') { return { id: approvalId, action_id: 'action', version: 1, title: '获批内容材料', status, expires_at: '2030-01-01T00:00:00Z', audit_id: '12', run_id: 'run', ai_targets: [{ platform: 'qwen', prompt: '产品质保范围' }], fact_count: 1, execution: { channel: 'wechat', mode: 'generate_draft' } }; }
function preview(projectId = 'p1', mode = 'generate_draft') { return { data: { brief: { schemaVersion: 2, projectId, title: '事实草稿主题', execution: { channel: mode === 'manual_task' ? 'website' : 'wechat', mode }, aiTargets: [{ platform: 'qwen', prompt: '产品质保范围' }], facts: [{ id: 'fact', statement: '获批产品事实', scope: '仅适用X系列产品' }], approval: { id: approvalId, expiresAt: '2030-01-01T00:00:00Z' }, publicationAllowed: false } } }; }
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function fetchMock() { return vi.mocked(fetch); }
beforeEach(() => {
  state.projectId = 'p1'; state.search = '';
  state.workbench = { schema: 'citation-content-workbench-1', project_id: 'p1', enabled: true, publication_allowed: false, cursor: null, approval_id: null, next_cursor: null, can_prepare: true, items: [material()] };
  vi.mocked(useSectionFetch).mockImplementation((url: string | null) => ({ data: url?.includes('content-workbench') ? state.workbench : { totalContent: 0, publishedCount: 0, qualityAvg: null, recentContent: [] }, loading: false, error: false, locked: false, refetch: vi.fn() }) as never);
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('content workbench approved-evidence bridge', () => {
  it('loads formal material without legacy requests or automatic generation and previews by approval only', async () => {
    fetchMock().mockResolvedValue(response(preview())); render(<ContentPage />);
    expect(fetch).not.toHaveBeenCalled(); expect(screen.getByText('获批内容材料')).toBeTruthy();
    expect(useSectionFetch).toHaveBeenCalledWith('/api/integration/content-workbench?projectId=p1');
    fireEvent.click(screen.getByText('重新验证并准备材料'));
    await screen.findByText('获批产品事实');
    const body = JSON.parse(String(fetchMock().mock.calls[0][1]?.body));
    expect(body).toEqual({ projectId: 'p1', action: 'previewDraft', approvalId, idempotencyKey: expect.any(String) });
    expect(screen.getByText('创建草稿生成任务（预占1次额度）')).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('keeps generation retries on the same approval/key when acceptance is uncertain', async () => {
    fetchMock().mockResolvedValueOnce(response(preview())).mockResolvedValueOnce(response({ error: '受理结果尚待确认' }, 503)).mockResolvedValueOnce(response({ data: { id: 'workflow-1', status: 'queued', contentPieceId: null, platforms: [] } }, 202));
    render(<ContentPage />); fireEvent.click(screen.getByText('重新验证并准备材料'));
    fireEvent.click(await screen.findByText('创建草稿生成任务（预占1次额度）'));
    await screen.findByText('受理结果尚待确认');
    fireEvent.click(screen.getByText('创建草稿生成任务（预占1次额度）'));
    await screen.findByText('打开生成进度');
    const calls = fetchMock().mock.calls.slice(1).map(([, init]) => JSON.parse(String(init?.body)));
    expect(calls[0]).toEqual(calls[1]); expect(calls[0].action).toBe('generateDraft');
    expect(screen.getByText('打开生成进度').closest('a')?.getAttribute('href')).toBe('/content/workflows/workflow-1?projectId=p1');
  });
  it('routes website material only to manual tasks without generation', async () => {
    fetchMock().mockResolvedValueOnce(response(preview('p1', 'manual_task'))).mockResolvedValueOnce(response({ data: { id: 'manual1' } }, 202));
    render(<ContentPage />); fireEvent.click(screen.getByText('重新验证并准备材料'));
    fireEvent.click(await screen.findByText('保存人工内容任务（不扣生成额度）'));
    await screen.findByText('人工内容任务已保存，未消耗生成额度。');
    expect(screen.queryByText('创建草稿生成任务（预占1次额度）')).toBeNull();
    expect(JSON.parse(String(fetchMock().mock.calls[1][1]?.body)).action).toBe('createManualTask');
  });
  it('blocks stale material, readonly roles and pending context controls', () => {
    state.workbench.items = [material('stale')]; const { rerender } = render(<ContentPage />);
    expect(screen.getByText(/依据已变化/)).toBeTruthy(); expect(screen.queryByText('重新验证并准备材料')).toBeNull();
    state.workbench.items = [material()]; state.workbench.can_prepare = false; rerender(<ContentPage />);
    expect((screen.getByText('重新验证并准备材料') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('只读人工任务')).toBeTruthy(); expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a preview for another project without exposing its facts', async () => {
    fetchMock().mockResolvedValue(response(preview('p2'))); render(<ContentPage />);
    fireEvent.click(screen.getByText('重新验证并准备材料')); await screen.findByText('材料范围不匹配，请重新读取');
    expect(screen.queryByText('获批产品事实')).toBeNull();
  });
  it('does not retain old material after a project switch', async () => {
    const { rerender } = render(<ContentPage />); expect(screen.getByText('获批内容材料')).toBeTruthy();
    state.projectId = 'p2'; rerender(<ContentPage />);
    await waitFor(() => expect(screen.queryByText('获批内容材料')).toBeNull()); expect(screen.getByRole('alert')).toBeTruthy();
  });
});
