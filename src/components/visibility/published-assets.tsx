"use client";
import { useEffect, useRef, useState } from 'react';
import type { EvidenceRun } from '@/types/intelligence';

const cls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm';
type Asset = { id: string; url: string; channel: string; published_at: string; reason: string };
export function PublishedAssets({ run, projectId }: { run: EvidenceRun; projectId: string }) {
  const [plans, setPlans] = useState<Array<{ id: string; title: string }>>([]), [assets, setAssets] = useState<Asset[]>([]);
  const [actionId, setActionId] = useState(''), [url, setUrl] = useState(''), [channel, setChannel] = useState('website'), [publishedText, setPublishedText] = useState(''), [time, setTime] = useState(''), [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const pending = useRef<{ value: string; key: string } | null>(null);
  useEffect(() => { const controller = new AbortController();
    Promise.all(['actions', 'assets'].map(view => fetch(`/api/integration/intelligence?${new URLSearchParams({ view, projectId, runId: run.id })}`, { signal: controller.signal }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '发布记录读取失败'); return data; })))
      .then(([actions, data]) => { if (!controller.signal.aborted) { setPlans(actions.actions); setAssets(data.assets); } }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [projectId, run.id, refresh]);
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publishedText)));
      const contentHash = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const payload = { action: 'recordAsset', actionId, url, channel, contentHash, publishedAt: new Date(time).toISOString(), reason };
      const value = JSON.stringify(payload); if (pending.current?.value !== value) pending.current = { value, key: crypto.randomUUID() };
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...payload, idempotencyKey: pending.current.key }) });
      const data = await response.json(); if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(data.error || '发布登记失败'); }
      pending.current = null; setMessage('人工发布记录已保存；该记录不构成发布授权或效果证明。'); setRefresh(old => old + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : '发布登记失败'); } finally { setBusy(false); }
  };
  return <section className="dashboard-surface space-y-3 p-5"><h3 className="font-semibold">登记已发布内容</h3><p className="text-sm text-[var(--text-secondary)]">负责人登记实际发布的地址、时间和内容版本，保留与行动计划的关系。这里不会执行发布，也不会把草稿生成成功计为发布成功。</p>
    <select aria-label="发布关联行动" value={actionId} disabled={busy} onChange={event => setActionId(event.target.value)} className={cls}><option value="">选择行动计划</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.title}</option>)}</select>
    <input aria-label="已发布内容地址" value={url} disabled={busy} onChange={event => setUrl(event.target.value)} placeholder="实际发布的HTTP或HTTPS地址" className={`${cls} w-full`} />
    <select aria-label="已发布渠道" value={channel} disabled={busy} onChange={event => setChannel(event.target.value)} className={cls}>{Object.entries({ website: '网站', wechat: '公众号', weibo: '微博', xiaohongshu: '小红书', douyin: '抖音', zhihu: '知乎', toutiao: '头条' }).map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select>
    <input aria-label="发布时间" type="datetime-local" value={time} disabled={busy} onChange={event => setTime(event.target.value)} className={cls} />
    <textarea aria-label="已发布版本正文" value={publishedText} disabled={busy} maxLength={200000} onChange={event => setPublishedText(event.target.value)} placeholder="粘贴实际发布的版本正文，用于识别内容版本" className={`${cls} w-full`} /><p className="text-xs text-[var(--text-secondary)]">本次仅在浏览器计算版本指纹，正文不随登记请求上传。</p>
    <textarea aria-label="发布登记依据" value={reason} disabled={busy} maxLength={2000} onChange={event => setReason(event.target.value)} placeholder="说明在哪里发布、如何核对版本（至少5字）" className={`${cls} w-full`} />
    <button disabled={busy || !actionId || !url || !time || !publishedText.trim() || reason.trim().length < 5} onClick={save} className={`${cls} disabled:opacity-40`}>保存人工发布记录</button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {assets.map(asset => <article key={asset.id} className="border-t border-[var(--border)] pt-3 text-sm"><a href={asset.url} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--color-primary)]">{asset.url}</a><p>{new Date(asset.published_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · 人工登记，尚未核验</p><p className="text-[var(--text-secondary)]">{asset.reason}</p></article>)}
  </section>;
}
