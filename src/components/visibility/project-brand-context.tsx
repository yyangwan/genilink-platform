"use client";
import { useCallback, useEffect, useState } from 'react';
export function ProjectBrandContext({ projectId, onSaved, refreshKey = 0 }: { projectId: string; onSaved: () => void; refreshKey?: number }) {
  const [state, setState] = useState<{ context: { version: number } | null; pending: number; retry?: { version: number; attempts: number; nextAttemptAt: string | null; lastErrorCode: string | null } | null } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'brandContext' })}`, { signal, cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || '品牌配置读取失败'); if (!signal?.aborted) setState(data);
  }, [projectId, refreshKey]);
  useEffect(() => { const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'brandContext' })}`, { signal: controller.signal, cache: 'no-store' }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '品牌配置读取失败'); return data; }).then(data => { if (!controller.signal.aborted) setState(data); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [projectId, refreshKey]);
  const sync = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, action: 'syncBrandContext', expectedVersion: state?.context?.version || 0 }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '品牌同步待重试'); setState(data);
      setMessage(data.pending ? '部分任务仍待同步，可继续重试。' : '品牌配置已同步。请重新分析对应审计，新修订将使用当前品牌配置。'); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : '同步失败'); await load().catch(() => undefined); } finally { setBusy(false); }
  };
  return <section className="dashboard-surface space-y-3 p-5"><h2 className="font-semibold">项目品牌配置同步</h2><p className="text-sm text-[var(--text-secondary)]">从项目已关联品牌读取名称、别名和自有品牌/竞品身份。关联增删、品牌资料修改和软删除会自动保存配置；同步未确认时可在这里重试。未注册主体仍可参与对比，不会自动注册。</p><p className="text-sm">本地配置版本：{state?.context?.version || 0} · 待同步任务：{state?.pending ?? '读取中'}</p>{state?.retry && <p className="text-xs text-[var(--text-secondary)]">最早待同步版本：{state.retry.version} · 未确认重试次数：{state.retry.attempts}{state.retry.nextAttemptAt && ` · 下次可重试时间：${new Date(state.retry.nextAttemptAt).toLocaleString()}`}</p>}<button disabled={busy || !state} onClick={sync} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">{busy ? '同步中…' : '同步当前配置 / 重试待同步任务'}</button>{message && <p role="status" className="text-sm">{message}</p>}</section>;
}
