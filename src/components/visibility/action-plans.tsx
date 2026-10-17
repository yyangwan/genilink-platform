"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EvidenceRun } from "@/types/intelligence";
import { getAiPlatformLabel } from "@/lib/ai-platforms";

interface Plan { id: string; title: string; revision: number; status: string; approval_valid: boolean; target: { platform: string; prompt: string } }

export function ActionPlans({ run, projectId, readOnly = false, platform = "" }: { run: Pick<EvidenceRun, "id" | "summary">; projectId: string; readOnly?: boolean; platform?: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keys = useRef(new Map<string, string>());
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/integration/intelligence?${new URLSearchParams({ view: "actions", runId: run.id, projectId })}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "行动读取失败");
      if (!signal?.aborted) setPlans(data.actions);
    } catch (err) { if (!signal?.aborted) setError(err instanceof Error ? err.message : "行动读取失败"); }
  }, [run.id, projectId]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ view: "actions", runId: run.id, projectId })}`, { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "行动读取失败"); return data; })
      .then(data => { if (!controller.signal.aborted) setPlans(data.actions); })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "行动读取失败"); });
    return () => controller.abort();
  }, [run.id, projectId]);
  const submit = async (payload: object) => {
    if (readOnly) return;
    const signature = JSON.stringify(payload);
    const idempotencyKey = keys.current.get(signature) || crypto.randomUUID();
    keys.current.set(signature, idempotencyKey); setBusy(true); setError("");
    try {
      const response = await fetch("/api/integration/intelligence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, ...payload, idempotencyKey }) });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) keys.current.delete(signature); throw new Error(data.error || "行动操作失败，请刷新版本"); }
      keys.current.delete(signature); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "行动操作失败"); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4">
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5"><h2 className="font-semibold">行动计划</h2>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">从本修订诊断创建核实任务和内容实验。审批仅授权开展计划，事实确认与内容发布需要后续复核；证据变化会使审批失效。</p>
      {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
      <div className="mt-4 space-y-2">{run.summary.diagnoses?.filter(item => item.record_id && (!platform || item.platform === platform)).map(item => <div key={item.record_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3 text-sm">
        <p>{getAiPlatformLabel(item.platform)} · {item.finding}</p><button disabled={busy || readOnly} onClick={() => submit({ action: "createAction", runId: run.id, diagnosisId: item.record_id })} className="text-[var(--color-primary)] disabled:opacity-40">创建行动计划</button>
      </div>)}</div>
      <textarea aria-label="行动审批依据" value={reason} onChange={event => setReason(event.target.value)} disabled={busy || readOnly} maxLength={2000} placeholder="审批前填写已检查的证据、尚待核实事项和计划依据（至少5字）" className="mt-4 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-3 text-sm" />
      <button onClick={() => load()} disabled={busy} className="mt-2 text-sm text-[var(--color-primary)]">刷新行动状态</button>
    </div>
    {plans.filter(plan => !platform || plan.target.platform === platform).map(plan => <div key={plan.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <h3 className="font-semibold">{plan.title}</h3><p className="mt-2 text-sm text-[var(--text-secondary)]">{getAiPlatformLabel(plan.target.platform)} · {plan.target.prompt} · 修订 {plan.revision}</p>
      <p className="mt-2 text-sm">{plan.status === "stale" ? "证据版本已变化，请从新分析修订重新创建计划" : plan.approval_valid ? "计划审批有效，事实与发布仍待复核" : "等待计划审批"}</p>
      <button disabled={busy || readOnly || plan.status !== "proposed" || reason.trim().length < 5} onClick={() => submit({ action: "approveAction", actionId: plan.id, expectedRevision: plan.revision, reason })} className="mt-3 rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-40">批准开展计划</button>
    </div>)}
  </section>;
}
