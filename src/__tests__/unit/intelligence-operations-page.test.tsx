// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
vi.mock('@/components/project/use-project-id', () => ({ useProjectId: () => ({ projectId: 'p1', loading: false }) }));
vi.mock('@/components/ui/page-header', () => ({ PageHeader: ({ title, actions }: { title: string; actions: React.ReactNode }) => <header>{title}{actions}</header> }));
import { OperationsContent } from '@/components/visibility/intelligence-operations';
const data = { project_id: 'p1', observed_at: '2026-10-16T00:00:00Z', enabled: true,
  worker: { status: 'unknown', recent_count: 0, last_seen_at: null, threshold_seconds: 90, storage_configuration: {}, temporary_disk: {} },
  queue: { counts: {}, due: 0, oldest_due_at: null, expired_leases: 0, recent_failures: [] },
  sources: { fetches_last_24h: {}, snapshot_integrity_records: {} }, usage: { model_request_reservations: 7, unknown_job_records: 1 } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('intelligence operations', () => {
  it('shows unknown health and unconnected billing rather than success or zero cost; refresh is read-only', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => data }); vi.stubGlobal('fetch', fetcher);
    render(<OperationsContent projectId="p1" />);
    expect(await screen.findByText('尚无心跳记录')).toBeTruthy();
    expect(screen.getByText('实际费用、OSS 流量、联合备份恢复验证：未接入')).toBeTruthy();
    expect(screen.getByText(/项目累计模型请求预留：7/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '刷新诊断' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher).toHaveBeenLastCalledWith('/api/integration/intelligence?projectId=p1&view=operations', expect.objectContaining({ cache: 'no-store' }));
    expect(fetcher.mock.calls.every(([, options]) => !options.method)).toBe(true);
  });
  it('rejects another project and hides earlier data on project change', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => data }); vi.stubGlobal('fetch', fetcher);
    const { rerender } = render(<OperationsContent projectId="p1" />);
    await screen.findByText(/项目累计模型请求预留：7/);
    rerender(<OperationsContent projectId="p2" />);
    expect((await screen.findByRole('alert')).textContent).toContain('诊断数据与当前项目不一致');
    expect(screen.queryByText(/项目累计模型请求预留：7/)).toBeNull();
  });
  it('ignores a stale response after project switch', async () => {
    let finish: (value: unknown) => void = () => {};
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => ({ ...data, project_id: 'p2' }) }); vi.stubGlobal('fetch', fetcher);
    const { rerender } = render(<OperationsContent projectId="p1" />);
    rerender(<OperationsContent projectId="p2" />);
    await screen.findByText('尚无心跳记录');
    finish({ ok: true, json: async () => ({ ...data, usage: { model_request_reservations: 999 } }) });
    await waitFor(() => expect(screen.queryByText(/999/)).toBeNull());
  });
  it('does not render raw service errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'private-key-bucket' }) }));
    render(<OperationsContent projectId="p1" />);
    await screen.findByRole('alert');
    expect(screen.queryByText(/private-key-bucket/)).toBeNull();
  });
});
