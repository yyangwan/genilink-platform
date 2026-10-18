// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CaptureProgress, type CaptureStatus } from '@/components/visibility/capture-progress';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const task: CaptureStatus = { audit_id: '12', status: 'running', expected_samples: 4, sealed: 2, failed: 1,
  source_pending: 3, analysis_pending: 1, refresh_pending: true, published_run_id: null,
  samples: [{ id: 'a', platform: 'qwen', status: 'sealed' }, { id: 'b', platform: 'qwen', status: 'failed' }, { id: 'c', platform: 'doubao', status: 'sealed' }, { id: 'd', platform: 'doubao', status: 'pending' }] };

describe('task progress and recovery', () => {
  it('shows scheduled refresh and source gaps without claiming analysis is executing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...task, status: 'partial', analysis_pending: 0,
      refresh_waiting: true, refresh_wait_reason: 'enhancement_quota', refresh_available_at: '2026-10-19T00:48:07Z',
      source_pending: 0, source_failed_documents: 2, source_unresolved: 35 })));
    render(<CaptureProgress projectId="p1" auditId="12" />);
    await screen.findByText('等待下一次增量分析额度');
    expect(screen.getByText(/当前未在执行/)).toBeTruthy();
    expect(screen.getByText('2 个来源正文未获取 · 35 条来源缺少精确链接')).toBeTruthy();
    expect(screen.queryByText('正在处理分析任务')).toBeNull();
  });

  it('distinguishes a failed analysis from a partial published analysis', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ ...task, analysis_pending: 0, refresh_pending: false, analysis_status: 'failed' }))
      .mockResolvedValueOnce(Response.json({ ...task, analysis_pending: 0, refresh_pending: false, analysis_status: 'partial', published_run_id: 'run2', semantic_error_count: 1 }));
    vi.stubGlobal('fetch', fetcher);
    render(<CaptureProgress projectId="p1" auditId="12" />);
    await screen.findByText('分析失败，尚未产出本次结果');
    fireEvent.click(screen.getByRole('button', { name: '刷新状态' }));
    await screen.findByText('已产出部分分析，存在证据缺口');
    expect(screen.getByText('1 个文本片段解析失败，其他片段仍保留')).toBeTruthy();
  });

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
