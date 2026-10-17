"use client";
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { EvidenceRun } from '@/types/intelligence';
import { EvidenceDraftExecution } from './evidence-draft-execution';
import { ManualContentTasks } from './manual-content-tasks';

export function DraftBriefs({ run, projectId }: { run: EvidenceRun; projectId: string }) {
  const [plans, setPlans] = useState<Array<{ id: string; title: string; approval_valid: boolean }>>([]);
  const [facts, setFacts] = useState<Array<{ id: string; statement: string; status: string }>>([]);
  const [plan, setPlan] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [channel, setChannel] = useState('wechat'), [title, setTitle] = useState(''), [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState(''), [version, setVersion] = useState(0), [approvalId, setApprovalId] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [manualRefresh, setManualRefresh] = useState(0);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['actions', 'facts'].map(view => fetch(`/api/integration/intelligence?${new URLSearchParams({ view, runId: run.id, projectId })}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '材料读取失败'); return data; })))
      .then(([actions, materials]) => { if (!controller.signal.aborted) { setPlans(actions.actions); setFacts(materials.facts); } })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [run.id, projectId]);
  const approve = async () => {
    const payload = { projectId, action: 'approveDraft', actionId: plan, factIds: selected, channel, title, reason, expiresAt: new Date(expiry).toISOString(), expectedVersion: version };
    const signature = JSON.stringify(payload); if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey: pending.current.key }) });
      const data = await response.json(); if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(data.error || '草稿审批失败'); }
      pending.current = null; setApprovalId(data.approval_id); setVersion(data.version);
    } catch (err) { setError(err instanceof Error ? err.message : '草稿审批结果尚待确认，请重试'); }
    finally { setBusy(false); }
  };
  const cls = "rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm";
  return <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5 space-y-3">
    <h2 className="font-semibold">证据内容草稿</h2><p className="text-sm text-[var(--text-secondary)]">选择当前获批计划及其平台引用中的有效事实。草稿审批与计划审批分开，不能直接发布；网站和未开放生成的渠道转人工任务。ContentOS准备前会重新验证依据。</p>
    {error && <p role="alert" className="text-sm">{error}</p>}
    <select aria-label="内容行动计划" value={plan} onChange={event => setPlan(event.target.value)} disabled={busy} className={cls}><option value="">选择有效获批计划</option>{plans.filter(item => item.approval_valid).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
    <div className="space-y-2">{facts.filter(item => item.status === "valid").map(fact => <label key={fact.id} className="block text-sm"><input type="checkbox" disabled={busy} checked={selected.includes(fact.id)} onChange={event => setSelected(ids => event.target.checked ? [...ids, fact.id] : ids.filter(id => id !== fact.id))} /> {fact.statement}</label>)}</div>
    <input aria-label="草稿主题" maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="明确草稿主题（至少5字）" disabled={busy} className={`${cls} w-full`} />
    <select aria-label="草稿执行渠道" value={channel} onChange={event => setChannel(event.target.value)} disabled={busy} className={cls}>{["wechat", "weibo", "xiaohongshu", "douyin", "website", "zhihu", "toutiao"].map(value => <option key={value} value={value}>{({ wechat: "公众号", weibo: "微博", xiaohongshu: "小红书", douyin: "抖音", website: "网站人工任务", zhihu: "知乎人工任务", toutiao: "头条人工任务" } as Record<string, string>)[value]}</option>)}</select>
    <label className="ml-3 text-sm">审批截止 <input aria-label="草稿审批截止" type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} disabled={busy} className={cls} /></label>
    <label className="block text-sm">当前审批版本 <input aria-label="草稿审批版本" type="number" min={0} value={version} onChange={event => setVersion(Number(event.target.value))} disabled={busy} className={`${cls} w-20`} />（首次填0）</label>
    <textarea aria-label="草稿审批理由" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="说明已复核事实与范围，以及内容实验目的（至少5字）" disabled={busy} className={`${cls} w-full`} />
    <button disabled={busy || !plan || !selected.length || selected.length > 20 || title.trim().length < 5 || reason.trim().length < 5 || !expiry || !Number.isSafeInteger(version) || version < 0} onClick={approve} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">批准内容草稿材料</button>
    {approvalId && <Link className="block text-sm text-[var(--color-primary)]" href={`/content?${new URLSearchParams({ project: projectId, approvalId })}`}>前往内容工作台使用该材料</Link>}
    <div className="flex gap-3"><input aria-label="草稿审批编号" value={approvalId} onChange={event => setApprovalId(event.target.value)} disabled={busy} placeholder="可选：回查已有草稿审批编号" className={`${cls} flex-1`} /></div>
    {approvalId && <EvidenceDraftExecution key={`${projectId}-${approvalId}`} projectId={projectId} approvalId={approvalId} disabled={busy} onManualCreated={() => setManualRefresh(old => old + 1)} />}
    <ManualContentTasks key={`${projectId}-${manualRefresh}`} projectId={projectId} />
  </section>;
}
