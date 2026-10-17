// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportPdfButton } from '@/components/visibility/report-pdf-button';
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('explicit PDF download', () => {
  it('does not enable exports from a pending or stale snapshot', () => {
    render(<ReportPdfButton projectId="p1" auditId="12" runId={'a'.repeat(32)} enabled={false} />);
    expect((screen.getByText('导出 PDF') as HTMLButtonElement).disabled).toBe(true);
  });
  it('keeps the same operation key and revision after an uncertain network failure', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('连接中断')).mockRejectedValueOnce(new Error('连接中断'));
    vi.stubGlobal('fetch', fetcher);
    render(<ReportPdfButton projectId="p1" auditId="12" runId={'a'.repeat(32)} enabled />);
    fireEvent.click(screen.getByText('导出 PDF'));
    await screen.findByText('连接中断');
    await waitFor(() => expect((screen.getByText('导出 PDF') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText('导出 PDF'));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ runId: 'a'.repeat(32) });
    expect(fetcher.mock.calls[1][0]).toContain('projectId=p1');
  });
});
