"use client";
import { useEffect, useRef, useState } from 'react';
import type { EvidenceRun } from '@/types/intelligence';
type Brand = { brandId: string; name: string; isCompetitor: boolean; analysisRole: string; entityId: string | null; identityVersion: number | null };
export function ProjectBrandBindings({ projectId, run, onSaved }: { projectId: string; run: EvidenceRun; onSaved: () => void }) {
  const [data, setData] = useState<{ version: number; brands: Brand[] } | null>(null), [brandId, setBrandId] = useState(''), [entityId, setEntityId] = useState(''), [role, setRole] = useState('registered'), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const pending = useRef<{ hash: string; key: string } | null>(null);
  useEffect(() => { const controller = new AbortController(); fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'brandBindings' })}`, { signal: controller.signal, cache: 'no-store' }).then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error || '品牌绑定读取失败'); return value; }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); }); return () => controller.abort(); }, [projectId, refresh]);
  const save = async () => {
    const input = { action: 'bindProjectBrand', brandId, entityId: entityId || null, analysisRole: role, reason, expectedVersion: data?.version || 0 };
    const hash = JSON.stringify(input); if (pending.current?.hash !== hash) pending.current = { hash, key: crypto.randomUUID() }; setBusy(true); setMessage('');
    try { const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...input, idempotencyKey: pending.current.key }) }); const result = await response.json(); if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(result.error || '绑定未确认'); } pending.current = null; setRefresh(value => value + 1); setMessage('绑定依据已保存，请完成品牌配置同步并重新分析对应审计。旧分析记录保留。'); onSaved(); }
    catch (error) { setMessage(error instanceof Error ? error.message : '绑定未确认'); } finally { setBusy(false); }
  };
  const selected = data?.brands.find(brand => brand.brandId === brandId), cls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm';
  return <section className="dashboard-surface space-y-3 p-5"><h2 className="font-semibold">项目品牌身份绑定</h2><p className="text-sm text-[var(--text-secondary)]">将本项目已登记品牌绑定到已确认实体，避免只凭同名词指定自有品牌或竞品。“仅用于对比”只改变本项目分析角色，保留全局登记和已有额度占用；未登记实体仍可参与统计。</p>
    <div className="flex flex-wrap gap-3"><select aria-label="已关联品牌" className={cls} value={brandId} disabled={busy || !data} onChange={event => { const brand = data?.brands.find(item => item.brandId === event.target.value); setBrandId(event.target.value); setEntityId(brand?.entityId || ''); setRole(brand?.analysisRole || 'registered'); }}><option value="">选择项目品牌</option>{data?.brands.map(brand => <option key={brand.brandId} value={brand.brandId}>{brand.name} · {brand.isCompetitor ? '登记竞品' : '登记自有品牌'}</option>)}</select>
    <select aria-label="品牌对应实体" className={cls} value={entityId} disabled={busy} onChange={event => setEntityId(event.target.value)}><option value="">解除绑定 / 尚未确认</option>{Object.entries(run.identity_reviews || {}).filter(([, item]) => item.decision === 'confirmed').map(([id, item]) => <option key={id} value={id}>{item.canonical_name}</option>)}</select>
    <select aria-label="本项目分析角色" className={cls} value={role} disabled={busy} onChange={event => setRole(event.target.value)}><option value="registered">采用登记的自有品牌/竞品身份</option><option value="comparison">仅用于对比</option></select></div>
    {selected && <p className="text-sm">已存绑定：{selected.entityId ? `${run.identity_reviews?.[selected.entityId]?.canonical_name || selected.entityId} · 身份版本 ${selected.identityVersion}` : '尚未绑定'}</p>}
    <textarea aria-label="品牌身份绑定依据" className={`${cls} w-full`} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} maxLength={2000} placeholder="填写品牌与实体的对应依据（至少5字）" />
    <button className={cls} disabled={busy} onClick={() => setRefresh(value => value + 1)}>刷新品牌配置</button><button className={`${cls} disabled:opacity-40`} disabled={busy || !brandId || !data || reason.trim().length < 5} onClick={save}>保存本项目角色与绑定</button>{message && <p role="status" className="text-sm">{message}</p>}</section>;
}
