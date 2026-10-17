"use client";
import { useEffect, useRef, useState } from 'react';
import type { EvidenceRun } from '@/types/intelligence';

type Binding = { version: number; decision: string; target_entity_id: string | null; target_name: string | null; reason: string };
export function EntityAliases({ run, projectId, onSaved }: { run: EvidenceRun; projectId: string; onSaved: () => void }) {
  const [bindings, setBindings] = useState<Record<string, Binding>>({}), [source, setSource] = useState(''), [target, setTarget] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const entities = run.summary.entities || [];
  const sources = entities.flatMap(entity => entity.observed_entities || [{ id: entity.id, name: entity.name }]);
  const targets = Object.entries(run.identity_reviews || {}).filter(([id, item]) => item.decision === 'confirmed' && bindings[id]?.decision !== 'merge');
  useEffect(() => { const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'aliases' })}`, { signal: controller.signal, cache: 'no-store' }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '别名映射读取失败'); return data; }).then(data => { if (!controller.signal.aborted) setBindings(data.aliases); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [projectId, refresh]);
  const save = async (decision: 'merge' | 'unlink') => {
    const payload = { action: 'reviewAlias', runId: run.id, sourceEntityId: source, ...(decision === 'merge' ? { targetEntityId: target } : {}), decision, reason, expectedVersion: bindings[source]?.version || 0 };
    const signature = JSON.stringify(payload); if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...payload, idempotencyKey: pending.current.key }) }); const data = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(data.error || '别名保存失败'); }
      pending.current = null; setMessage('别名决定已保存，通过新分析修订更新统计。旧修订和原文提及保留，相关材料需要重新复核。'); setRefresh(old => old + 1); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : '别名保存失败'); } finally { setBusy(false); }
  };
  const cls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm';
  return <section className="dashboard-surface space-y-3 p-5"><h2 className="font-semibold">品牌与实体别名归并</h2><p className="text-sm text-[var(--text-secondary)]">仅将确属同一主体的名称归并到已确认实体，同一回答出现多个别名仍只计一次。产品与公司等不同类型不能整体归并；局部同名歧义请使用下方逐片段归属确认。</p>
    <div className="flex flex-wrap gap-3"><select aria-label="归并的原始实体" value={source} disabled={busy} onChange={event => setSource(event.target.value)} className={cls}><option value="">选择本分析中的原始名称</option>{sources.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select>
      <select aria-label="已确认归并目标" value={target} disabled={busy} onChange={event => setTarget(event.target.value)} className={cls}><option value="">选择已确认的同一主体</option>{targets.filter(([id]) => id !== source).map(([id, item]) => <option key={id} value={id}>{item.canonical_name}</option>)}</select></div>
    {bindings[source] && <p className="text-sm">当前决定：{bindings[source].decision === 'merge' ? `归并到 ${bindings[source].target_name}` : '保持原始名称统计'} · {bindings[source].reason}</p>}
    <textarea aria-label="别名归并依据" value={reason} maxLength={2000} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="说明名称关系、原文和身份依据，排除同名歧义（至少5字）" className={`${cls} w-full`} />
    <div className="flex gap-3"><button disabled={busy || !source || !target || source === target || reason.trim().length < 5} onClick={() => save('merge')} className={`${cls} disabled:opacity-40`}>确认整体别名归并</button><button disabled={busy || !source || bindings[source]?.decision !== 'merge' || reason.trim().length < 5} onClick={() => save('unlink')} className={`${cls} disabled:opacity-40`}>解除此名称归并</button></div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
