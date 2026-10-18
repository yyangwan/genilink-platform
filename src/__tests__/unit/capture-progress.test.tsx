// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureProgress, type CaptureStatus } from '@/components/visibility/capture-progress';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const task: CaptureStatus = { audit_id: '12', status: 'running', expected_samples: 4, sealed: 2, failed: 1,
  source_pending: 3, analysis_pending: 1, refresh_pending: true, published_run_id: null,
  samples: [{ id: 'a', platform: 'qwen', status: 'sealed' }, { id: 'b', platform: 'qwen', status: 'failed' }, { id: 'c', platform: 'doubao', status: 'sealed' }, { id: 'd', platform: 'doubao', status: 'pending' }] };

describe('task progress and recovery', () => {
  it('keeps last known counters on a failed status query and recovers without creating an audit', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(task)).mockRejectedValueOnce(new Error('连接中断')).mockResolvedValueOnce(Response.json({ ...task, sealed: 3 }));
    vi.stubGlobal('fetch', fetcher);
    render(<CaptureProgress projectId="p1" auditId="12" />);
    await screen.findByText('2 已入库 · 1 未成功');
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    await screen.findByRole('alert');
    expect(screen.getByText('2 已入库 · 1 未成功')).toBeTruthy();
    expect(screen.getByText(/最后成功同步/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '重新查询' }));
    await screen.findByText('3 已入库 · 1 未成功');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });

  it('does not call completed answers a completed report; includes platform progress and audit context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...task, status: 'completed', sealed: 4, failed: 0 })));
    render(<CaptureProgress projectId="p1" auditId="12" />);
    await screen.findByText('4 已入库 · 0 未成功');
    expect(screen.getByText('正在处理分析任务')).toBeTruthy();
    expect(screen.getByText('回答采集完成不等于报告已完成')).toBeTruthy();
    expect(screen.getByRole('link', { name: '查看本次证据' }).getAttribute('href')).toBe('/intelligence?project=p1&auditId=12');
    expect(screen.getAllByText('1 / 2 已入库')).toHaveLength(2);
  });

  it('notifies once per published run and rejects a response from another audit', async () => {
    const published = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ ...task, published_run_id: 'run1' })));
    const { rerender } = render(<CaptureProgress projectId="p1" auditId="12" onPublished={published} />);
    await waitFor(() => expect(published).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '刷新状态' }).hasAttribute('disabled')).toBe(false));
    expect(published).toHaveBeenCalledOnce();
    rerender(<CaptureProgress projectId="p2" auditId="13" onPublished={published} />);
    await screen.findByRole('alert');
    expect(screen.queryByText('2 已入库 · 1 未成功')).toBeNull();
    expect(published).toHaveBeenCalledOnce();
  });
});
