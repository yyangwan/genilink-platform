"use client";

import { useEffect, useRef, useState } from "react";
import { CAPTURE_PLATFORMS } from "@/lib/visibility/capture-policy";

interface Props { activeAuditId?: string; projectId: string; enabled: boolean; onCreated: (auditId: string) => void }

export function CaptureControls({ projectId, enabled, onCreated, activeAuditId }: Props) {
  const [prompts, setPrompts] = useState<Array<{ id: number; text: string }>>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [rounds, setRounds] = useState(3);
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
    if (!total || total > 1000 || selected.length > 100) return;
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
  return <section className="dashboard-surface p-5 space-y-4" aria-label="多轮采样设置">
    <h2 className="font-semibold">同题多轮采集</h2>
    <p className="text-sm text-[var(--text-secondary)]">系统统一采集各平台的回答、引用来源及可获取的文章正文。每轮保存独立回答，未取得或不完整的数据会在任务进度与分析中标明。</p>
    <div className="capture-fields">
      <label>独立轮次<input aria-label="独立轮次" type="number" min={1} max={10} value={rounds} onChange={e => setRounds(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} disabled={busy} className="dashboard-input" /></label>
    </div>
    <details><summary className="cursor-pointer text-sm">选择提示词：已选 {selected.length} / {prompts.length}</summary><div className="mt-3 max-h-48 space-y-2 overflow-auto">{prompts.map(item => <label key={item.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={selected.includes(item.id)} disabled={busy} onChange={e => setSelected(previous => e.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} className="mt-1" /><span>{item.text}</span></label>)}</div></details>
    {activeAuditId && <p className="audit-meta">已创建采集任务 #{activeAuditId}。进度在当前任务面板持续更新；再次创建会产生独立的新任务。</p>}
    {error && <p role="alert" className="text-sm text-[var(--color-error)]">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-[var(--text-secondary)]">{selected.length} 个提示词 × {CAPTURE_PLATFORMS.length} 个平台 × {rounds} 轮 = {total} 次计划采集</p><button type="button" onClick={start} disabled={!enabled || busy || !total || total > 1000 || selected.length > 100} className="dashboard-button dashboard-button--primary">{busy ? "正在创建…" : activeAuditId ? "新建另一次采集" : "开始多轮采集"}</button></div>
    {total > 1000 && <p role="alert" className="text-sm text-[var(--color-error)]">单次最多安排 1000 次采集，请减少提示词或独立轮次。</p>}
    {promptsLoading && <p className="audit-meta" role="status">正在加载项目提示词…</p>}
    {!promptsLoading && !error && !prompts.length && <p className="text-sm text-[var(--text-secondary)]">请先在项目中添加提示词。</p>}
  </section>;
}
