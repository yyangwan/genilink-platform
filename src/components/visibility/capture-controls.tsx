"use client";

import { useEffect, useRef, useState } from "react";
import { CAPTURE_PLATFORMS } from "@/lib/visibility/capture-policy";
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';

interface Props { taskState?: "checking" | "running" | "idle"; activeAuditId?: string; projectId: string; enabled: boolean; onCreated: (auditId: string) => void }

export function CaptureControls({ projectId, enabled, onCreated, activeAuditId, taskState = "idle" }: Props) {
  const [prompts, setPrompts] = useState<Array<{ id: number; text: string }>>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const rounds = 1;
  const [error, setError] = useState("");
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const operation = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/integration/intelligence?view=prompts&projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok || !Array.isArray(data)) throw new Error("提示词读取失败"); return data as Array<{ id: number; text: string }>; })
      .then(data => { setPrompts(data); setSelected(data.length <= 100 ? data.map(item => item.id) : []); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setPromptsLoading(false); });
    return () => controller.abort();
  }, [projectId]);
  const total = selected.length * CAPTURE_PLATFORMS.length * rounds;
  const start = async () => {
    if (taskState !== "idle" || busy || !enabled || !total || total > 1000 || selected.length > 100) return;
    const payload = { action: "capture", projectId, promptIds: selected, rounds };
    const signature = JSON.stringify(payload);
    if (operation.current?.signature !== signature) operation.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/integration/intelligence", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: operation.current.key }) });
      const data = await response.json();
      if (!response.ok && response.status < 500) operation.current = null;
      if (!response.ok || typeof data.audit_id !== "string") throw new Error(data.error || "采集创建失败，重试会沿用相同请求编号");
      operation.current = null;
      onCreated(data.audit_id);
    } catch (e) { setError(e instanceof Error ? e.message : "采集创建失败"); }
    finally { setBusy(false); }
  };
  return <section className="citation-panel citation-pad visibility-collection__launch" aria-label="本次采集">
    <div className="visibility-collection__launch-row"><div>
      <h2>{selected.length} 个提示词 × {CAPTURE_PLATFORMS.length} 个平台</h2>
      <p>每题每平台一次 · {CAPTURE_PLATFORMS.length} 个平台，共 {total} 次计划采集</p>
      <div className="visibility-collection__platforms" aria-label="本次覆盖平台">{CAPTURE_PLATFORMS.map(platform => <AiPlatformLabel key={platform} platform={platform} iconSize={22} />)}</div>
    </div><button type="button" onClick={start} disabled={taskState !== "idle" || !enabled || busy || !total || total > 1000 || selected.length > 100} className="dashboard-button dashboard-button--primary">{busy ? "正在创建…" : taskState === "checking" ? "正在确认任务状态…" : taskState === "running" ? "当前采集进行中" : "开始本次采集"}</button></div>
    <details className="visibility-collection__prompts"><summary>选择提示词：已选 {selected.length} / {prompts.length}</summary><div className="mt-3 max-h-48 space-y-2 overflow-auto">{prompts.map(item => <label key={item.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={selected.includes(item.id)} disabled={busy || taskState !== 'idle'} onChange={e => setSelected(previous => e.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} className="mt-1" /><span>{item.text}</span></label>)}</div></details>
    {activeAuditId && <p className="audit-meta">已创建采集任务 #{activeAuditId}。进度在当前任务面板持续更新；再次创建会产生独立的新任务。</p>}
    {error && <p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>}
    {total > 1000 && <p role="alert" className="text-sm text-[var(--color-error)]">单次最多安排 1000 次采集，请减少提示词。</p>}
    {promptsLoading && <p className="audit-meta" role="status">正在加载项目提示词…</p>}
    {!promptsLoading && !error && !prompts.length && <p className="text-sm text-[var(--text-secondary)]">请先在项目中添加提示词。</p>}
  </section>;
}
