"use client";

import { useRef, useState } from "react";
import type { EvidenceRun } from "@/types/intelligence";

export function IdentityReview({ run, projectId, onSaved }: { run: EvidenceRun; projectId: string; onSaved: () => void }) {
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const entities = run.summary.entities || [];
  const save = async (decision: string) => {
    const expectedVersion = run.identity_reviews?.[selected]?.version || 0;
    const signature = JSON.stringify([run.id, selected, name, reason, decision, expectedVersion]);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/integration/intelligence", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, action: "reviewIdentity", runId: run.id, entityId: selected, canonicalName: name,
          reason, decision, expectedVersion, idempotencyKey: pending.current.key }) });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(data.error || "确认失败，请刷新版本"); }
      pending.current = null;
      setMessage("身份决定已保存，将通过新修订生效；当前固定修订保持原统计。"); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
    <h2 className="font-semibold">实体身份复核</h2>
    <p className="mt-2 text-sm text-[var(--text-secondary)]">结合下方原文提及确认名称。“排除”只排除该候选的后续判断，保留全部采集信息。此操作不会登记竞品，也不会合并同名实体。</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <select aria-label="复核实体" disabled={busy} value={selected} className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2" onChange={event => {
        setSelected(event.target.value); setName(entities.find(entity => entity.id === event.target.value)?.name || ""); setReason(""); setMessage("");
      }}><option value="">选择实体</option>{entities.map(entity => <option key={entity.id} value={entity.id}>{entity.name} · {run.identity_reviews?.[entity.id]?.decision === "confirmed" ? "已确认" : run.identity_reviews?.[entity.id]?.decision === "excluded" ? "已排除" : "待确认"}</option>)}</select>
      <input aria-label="确认名称" disabled={busy} maxLength={200} value={name} onChange={event => setName(event.target.value)} placeholder="企业或产品正式名称" className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2" />
    </div>
    <textarea aria-label="身份确认依据" disabled={busy} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="填写确认依据及同名歧义说明（至少5字）" className="mt-3 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3 text-sm" />
    {selected && run.identity_reviews?.[selected] && <p className="mb-3 text-sm">最新决定 v{run.identity_reviews[selected].version}：{run.identity_reviews[selected].reason}</p>}
    <div className="flex gap-3">{[["confirmed", "确认身份"], ["excluded", "排除此候选"]].map(([decision, title]) => <button key={decision} disabled={busy || !selected || !name.trim() || reason.trim().length < 5} onClick={() => save(decision)} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">{busy ? "保存中…" : title}</button>)}</div>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
