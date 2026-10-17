"use client";
import { useEffect, useRef, useState } from 'react';
import type { EvidenceRun } from '@/types/intelligence';

type Binding = { version: number; decision: string; target_entity_id: string | null;  reason: string };
export function MentionBindings({ run, projectId, onSaved }: { run: EvidenceRun; projectId: string; onSaved: () => void }) {
  const [bindings, setBindings] = useState<Record<string, Binding>>({}), [source, setSource] = useState(''), [target, setTarget] = useState(''), [reason, setReason] = useState(''), [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const sources = run.summary.mentions || [];
  const selected = sources.find(item => item.id === source);
  const targets = Object.entries(run.identity_reviews || {}).filter(([, item]) => item.decision === 'confirmed');
  useEffect(() => { const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'mention-bindings' })}`, { signal: controller.signal, cache: 'no-store' }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '片段归属映射读取失败'); return data; }).then(data => { if (!controller.signal.aborted) setBindings(data.bindings); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [projectId, refresh]);
  const save = async (decision: 'assign' | 'reset' | 'split') => {
    const payload = { action: 'reviewMentionBinding', runId: run.id, mentionId: source, ...(decision === 'assign' ? { targetEntityId: target } : {}), ...(decision === 'split' ? { newEntityName: newName } : {}), decision, reason, expectedVersion: bindings[selected?.binding_key || ""]?.version || 0 };
    const signature = JSON.stringify(payload); if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try { const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...payload, idempotencyKey: pending.current.key }) }); const data = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(data.error || '片段归属保存失败'); }
      pending.current = null; setMessage('片段归属决定已保存，通过新分析修订更新统计。旧修订和原文提及保留，相关材料需要重新复核。'); setRefresh(old => old + 1); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : '片段归属保存失败'); } finally { setBusy(false); }
  };
  const cls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm';
  return <section className="dashboard-surface space-y-3 p-5"><h2 className="font-semibold">逐片段实体归属确认</h2><p className="text-sm text-[var(--text-secondary)]">选择一个原始提及片段，确认它指向哪个已确认主体。决定仅适用于这个片段，优先于整体别名映射；新回答需要独立判断。恢复自动归属会重新采用整体别名规则。</p>
    <div className="flex flex-wrap gap-3"><select aria-label="原始提及片段" value={source} disabled={busy} onChange={event => setSource(event.target.value)} className={cls}><option value="">选择一个原始提及片段</option>{sources.map(entity => <option key={entity.id} value={entity.id}>{`${entity.observed_entity_name || entity.entity_name} · ${entity.quote.slice(0, 70)}`}</option>)}</select>
      <select aria-label="已确认片段目标" value={target} disabled={busy} onChange={event => setTarget(event.target.value)} className={cls}><option value="">选择已确认的目标主体</option>{targets.filter(([id]) => id !== source).map(([id, item]) => <option key={id} value={id}>{item.canonical_name}</option>)}</select></div>
    {selected && <blockquote className="border-l-2 pl-3 text-sm">{selected.quote}（{selected.owner_kind}）</blockquote>}
    {bindings[selected?.binding_key || ""] && <p className="text-sm">当前决定：{bindings[selected?.binding_key || ""].decision !== 'reset' ? `归并到 ${run.identity_reviews?.[bindings[selected?.binding_key || ""].target_entity_id || ""]?.canonical_name || "已确认实体"}` : '自动归属'} · {bindings[selected?.binding_key || ""].reason}</p>}
    <label className="block text-sm">独立主体名称（注明区别，如“云衡（工业设备品牌）”）<input aria-label="独立主体名称" value={newName} onChange={event => setNewName(event.target.value)} disabled={busy} maxLength={200} className={`${cls} mt-2 block w-full`} /></label>
    <p className="text-xs text-[var(--text-secondary)]">创建独立主体表示你已根据上下文确认这是另一主体；类型沿用原始候选。新主体不会继承原名称的自有品牌或竞品角色，其他同名片段仍须单独核对。</p>
    <textarea aria-label="片段归属依据" value={reason} maxLength={2000} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="说明名称关系、原文和身份依据，排除同名歧义（至少5字）" className={`${cls} w-full`} />
    <div className="flex flex-wrap gap-3"><button disabled={busy || !source || !target || reason.trim().length < 5} onClick={() => save('assign')} className={`${cls} disabled:opacity-40`}>确认此片段归属</button><button disabled={busy || !source || newName.trim().length < 2 || reason.trim().length < 5} onClick={() => save('split')} className={`${cls} disabled:opacity-40`}>确认独立主体并拆分此片段</button><button disabled={busy || !source || bindings[selected?.binding_key || ""]?.decision === 'reset' || !bindings[selected?.binding_key || ""] || reason.trim().length < 5} onClick={() => save('reset')} className={`${cls} disabled:opacity-40`}>恢复自动归属</button></div>
    {message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
