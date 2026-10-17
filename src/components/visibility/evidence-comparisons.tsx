"use client";
import { useRef, useState } from "react";
import type { EvidenceRun } from "@/types/intelligence";
import { getAiPlatformLabel } from "@/lib/ai-platforms";

const relations: Record<string, string> = { supports: "支持", partial: "部分支持", contradicts: "冲突", unverified: "无法核验" };
export function EvidenceComparisons({ items = [], run, projectId, onSaved, onSourceOpen, readOnly = false }: {
  items: EvidenceRun["summary"]["claim_evidence"]; run: { id: string; claim_reviews?: Record<string, { version: number; relation: string; source_quote: string; reason: string }> }; readOnly?: boolean; projectId: string; onSaved: () => void; onSourceOpen: (snapshotId: string) => void;
}) {
  const [selected, setSelected] = useState("");
  const [relation, setRelation] = useState("unverified");
  const [quote, setQuote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const save = async () => {
    if (readOnly) return;
    const payload = { projectId, action: "reviewEvidence", runId: run.id, evidenceId: selected, relation, sourceQuote: quote,
      reason, expectedVersion: run.claim_reviews?.[selected]?.version || 0 };
    const signature = JSON.stringify(payload);
    if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/integration/intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: pending.current.key }) });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(data.error || "复核保存失败，请刷新版本"); }
      pending.current = null; setMessage("人工复核已保存，模型原判定保持不变。"); onSaved();
    } catch (err) { setMessage(err instanceof Error ? err.message : "复核失败"); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3">{items.map(item => <section key={item.id} className="dashboard-surface p-5">
    <p className="text-sm text-[var(--text-secondary)]">{getAiPlatformLabel(item.platform)} · 模型判定：{relations[item.relation] || "无法核验"} · {run.claim_reviews?.[item.id] ? `人工判定：${relations[run.claim_reviews[item.id].relation]} v${run.claim_reviews[item.id].version}` : "待人工复核"}</p>
    <div className="mt-3 grid gap-4 md:grid-cols-2"><div><h3 className="text-sm font-semibold">回答观点</h3><blockquote className="mt-2 border-l-2 border-[var(--color-primary)] pl-4 text-sm">{item.answer_quote}</blockquote></div>
      <div><h3 className="text-sm font-semibold">{item.source_title || "该回答实际引用的原文"}</h3><blockquote className="mt-2 border-l-2 border-[var(--color-primary)] pl-4 text-sm">{item.source_quote || "没有取得可验证的支持片段"}</blockquote>
        <button className="mt-3 text-sm text-[var(--color-primary)]" onClick={() => onSourceOpen(item.snapshot_id)}>查看来源上下文</button></div></div>
    <button disabled={busy || readOnly} onClick={() => { setSelected(item.id); setRelation(run.claim_reviews?.[item.id]?.relation || item.relation); setQuote(run.claim_reviews?.[item.id]?.source_quote || item.source_quote); setReason(""); setMessage(""); }} className="mt-3 text-sm text-[var(--color-primary)]">复核此观点与来源</button>
    {run.claim_reviews?.[item.id] && <div className="mt-3 text-sm"><h4 className="font-semibold">人工复核证据与依据</h4><blockquote className="mt-2 whitespace-pre-wrap">{run.claim_reviews[item.id].source_quote || "未确认支持片段"}</blockquote><p className="mt-2 text-[var(--text-secondary)]">{run.claim_reviews[item.id].reason}</p></div>}
    {selected === item.id && <div className="mt-4 space-y-3">
      <select aria-label="人工支持关系" value={relation} disabled={busy || readOnly} onChange={event => setRelation(event.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2">{Object.entries(relations).map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select>
      <textarea aria-label="人工来源片段" maxLength={2000} disabled={busy || readOnly} value={quote} onChange={event => setQuote(event.target.value)} placeholder="从已保存的来源上下文复制逐字片段" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3 text-sm" />
      <textarea aria-label="观点复核依据" maxLength={2000} disabled={busy || readOnly} value={reason} onChange={event => setReason(event.target.value)} placeholder="说明主体、范围、时间与数值是否一致（至少5字）" className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3 text-sm" />
      <button disabled={busy || readOnly || reason.trim().length < 5 || (relation !== "unverified" && !quote.trim())} onClick={save} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">保存人工判定</button>
      {message && <p role="status" className="text-sm">{message}</p>}
    </div>}
  </section>)}</div>;
}
