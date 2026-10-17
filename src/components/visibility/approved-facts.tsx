"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceRun } from "@/types/intelligence";

interface Fact { id: string; version: number; statement: string; scope: string; status: string; valid_from: string; valid_until: string }
const statusLabels: Record<string, string> = { valid: "有效", scheduled: "尚未生效", expired: "已过期", withdrawn: "已撤回", needs_review: "依据变化，需复核", superseded: "已有新版本" };

export function ApprovedFacts({ run, projectId }: { run: EvidenceRun; projectId: string }) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [reviewId, setReviewId] = useState("");
  const [entityId, setEntityId] = useState("");
  const [scope, setScope] = useState("");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const keys = useRef(new Map<string, string>());
  const url = `/api/integration/intelligence?${new URLSearchParams({ view: "facts", projectId })}`;
  const load = useCallback(async () => { const response = await fetch(url); const data = await response.json(); if (!response.ok) throw new Error(data.error || "事实读取失败"); setFacts(data.facts); }, [url]);
  useEffect(() => { const controller = new AbortController(); fetch(url, { signal: controller.signal })
    .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "事实读取失败"); return data; })
    .then(data => { if (!controller.signal.aborted) setFacts(data.facts); })
    .catch(err => { if (!controller.signal.aborted) setMessage(err.message); }); return () => controller.abort(); }, [url]);
  const submit = async (payload: object) => {
    const signature = JSON.stringify(payload); const idempotencyKey = keys.current.get(signature) || crypto.randomUUID(); keys.current.set(signature, idempotencyKey);
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/integration/intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...payload, idempotencyKey }) });
      const data = await response.json(); if (!response.ok) { if (response.status < 500) keys.current.delete(signature); throw new Error(data.error || "事实操作失败，请核对当前修订"); }
      keys.current.delete(signature); await load(); setMessage("决定已保存，后续分析修订将更新事实快照。");
    } catch (err) { setMessage(err instanceof Error ? err.message : "操作失败"); } finally { setBusy(false); }
  };
  const reviews = Object.values(run.claim_reviews || {}).filter(item => item.relation === "supports");
  const inputClass = "rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm";
  return <section className="space-y-4">
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-semibold">批准事实</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">依据人工确认的支持关系，批准原文中的限定陈述。明确实体、适用产品/地域/场景和有效期；该决定不包含内容发布审批。</p>
      <div className="mt-4 flex flex-wrap gap-3"><select aria-label="已人工支持的证据" value={reviewId} disabled={busy} onChange={event => setReviewId(event.target.value)} className={inputClass}><option value="">选择人工支持的片段</option>{reviews.map(review => <option key={review.id} value={review.id}>{review.source_quote}</option>)}</select>
        <select aria-label="事实实体" value={entityId} disabled={busy} onChange={event => setEntityId(event.target.value)} className={inputClass}><option value="">选择已确认实体</option>{run.summary.entities?.filter(entity => entity.identity_status === "confirmed").map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></div>
      <input aria-label="事实适用范围" maxLength={1000} value={scope} disabled={busy} onChange={event => setScope(event.target.value)} placeholder="明确产品、地域与适用场景（至少5字）" className={`${inputClass} mt-3 w-full`} />
      <div className="mt-3 flex flex-wrap gap-3"><label className="text-sm">开始 <input aria-label="事实有效期开始" type="datetime-local" value={from} onChange={event => setFrom(event.target.value)} disabled={busy} className={inputClass} /></label><label className="text-sm">截止 <input aria-label="事实有效期截止" type="datetime-local" value={until} onChange={event => setUntil(event.target.value)} disabled={busy} className={inputClass} /></label><label className="text-sm">当前版本 <input aria-label="事实当前版本" type="number" min={0} value={version} onChange={event => setVersion(Number(event.target.value))} disabled={busy} className={`${inputClass} w-20`} />（新事实填0）</label></div>
      <textarea aria-label="事实批准或撤回依据" value={reason} maxLength={2000} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="填写批准或撤回理由（至少5字）" className={`${inputClass} mt-3 w-full`} />
      <button disabled={busy || !reviewId || !entityId || scope.trim().length < 5 || reason.trim().length < 5 || !from || !until || !Number.isSafeInteger(version) || version < 0 || Date.parse(until) <= Date.parse(from)} onClick={() => submit({ action: "approveFact", runId: run.id, reviewId, entityId, scope, reason, expectedVersion: version, validFrom: new Date(from).toISOString(), validUntil: new Date(until).toISOString() })} className="mt-3 rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">批准限定事实</button>
      <button disabled={busy} onClick={() => load().catch(err => setMessage(err.message))} className="ml-4 text-sm text-[var(--color-primary)]">刷新事实状态</button>
      {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    </div>
    {facts.map(fact => <div key={fact.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><blockquote className="text-sm">{fact.statement}</blockquote><p className="mt-2 text-sm">{fact.scope} · v{fact.version} · {statusLabels[fact.status] || "待复核"}</p><p className="mt-2 text-xs text-[var(--text-secondary)]">{fact.valid_from} 至 {fact.valid_until}</p><button disabled={busy || fact.status === "withdrawn" || reason.trim().length < 5} onClick={() => submit({ action: "withdrawFact", factId: fact.id, expectedVersion: fact.version, reason })} className="mt-3 text-sm text-[var(--color-primary)] disabled:opacity-40">撤回此事实</button></div>)}
  </section>;
}
