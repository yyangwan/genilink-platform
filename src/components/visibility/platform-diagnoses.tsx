import type { EvidenceRun } from "@/types/intelligence";
import { getAiPlatformLabel } from "@/lib/ai-platforms";

export function PlatformDiagnoses({ items, onAnswerOpen }: { items: EvidenceRun["summary"]["diagnoses"]; onAnswerOpen: (id: string) => void }) {
  return <div className="space-y-3">{(items || []).map((item, index) => <section key={item.id || index} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
    <h2 className="font-semibold">{getAiPlatformLabel(item.platform)} · 待复核诊断</h2>
    {item.prompt && <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.prompt} · {item.sample_count} 次独立样本</p>}
    <p className="mt-3 text-sm">{item.finding}</p>
    {item.action && <><h3 className="mt-4 text-sm font-semibold">建议任务 · 尚未批准执行</h3><p className="mt-2 text-sm">{item.action.task}</p>
      {!!item.action.materials_needed.length && <p className="mt-2 text-sm text-[var(--text-secondary)]">所需材料：{item.action.materials_needed.join("；")}</p>}
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.action.success_check}</p></>}
    <div className="mt-3 flex flex-wrap gap-3">{item.response_ids?.map((id, position) => <button key={id} onClick={() => onAnswerOpen(id)} className="text-sm text-[var(--color-primary)]">查看本组回答 {position + 1}</button>)}</div>
  </section>)}</div>;
}
