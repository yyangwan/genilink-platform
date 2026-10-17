"use client";
import { useRef, useState } from 'react';

export function ReportPdfButton({ projectId, auditId, runId, enabled }: { projectId: string; auditId: string; runId?: string; enabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<{ runId: string; key: string } | null>(null);
  const download = async () => {
    if (!runId || busy) return;
    if (pending.current?.runId !== runId) pending.current = { runId, key: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/integration/reports/${encodeURIComponent(auditId)}/pdf?${new URLSearchParams({ projectId })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.current.key }, body: JSON.stringify({ runId }) });
      if (!response.ok) { const error = await response.json(); if (response.status < 500) pending.current = null; throw new Error(error.error || '导出失败，请重试'); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `audit-${auditId}-${runId}.pdf`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      pending.current = null; setMessage('PDF 已生成，包含当前报告修订。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '导出失败，请重试'); }
    finally { setBusy(false); }
  };
  return <div className="text-sm"><button disabled={!enabled || !runId || busy} onClick={download} className="disabled:opacity-50">{busy ? '正在生成 PDF…' : '导出 PDF'}</button>{message && <p role="status" className="mt-2">{message}</p>}</div>;
}
