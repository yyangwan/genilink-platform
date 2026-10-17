"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import { getAiPlatformLabel } from "@/lib/ai-platforms";
import type { EvidenceRun, EvidenceRunListItem } from "@/types/intelligence";
import { CaptureControls } from "@/components/visibility/capture-controls";
import { MeasurementCohorts } from '@/components/visibility/measurement-cohorts';
import { PublishedAssets } from '@/components/visibility/published-assets';
import { DraftBriefs } from "@/components/visibility/draft-briefs";
import { ApprovedFacts } from "@/components/visibility/approved-facts";
import { ActionPlans } from "@/components/visibility/action-plans";
import { IdentityReview } from "@/components/visibility/identity-review";
import { MentionBindings } from '@/components/visibility/mention-bindings';
import { ProjectBrandBindings } from '@/components/visibility/project-brand-bindings';
import { ProjectBrandContext } from '@/components/visibility/project-brand-context';
import { EntityAliases } from '@/components/visibility/entity-aliases';
import { PlatformDiagnoses } from "@/components/visibility/platform-diagnoses";
import { EvidenceComparisons } from "@/components/visibility/evidence-comparisons";

const labels: Record<string, string> = {
  queued: "排队中", running: "分析中", ready: "已完成", partial: "部分完成", failed: "失败",
  captured: "正文已保存", pending: "等待抓取", blocked: "访问受限", unavailable: "无法取得", unknown: "待确认",
  own: "自有品牌", competitor: "已登记竞品", unregistered: "未登记或未确认绑定", comparison: "仅用于对比", answer_reference: "回答引用",
  search_candidate: "搜索候选", text_link: "文本链接", named_inference: "推测来源", answer: "回答", snapshot: "来源正文", citation: "来源摘要",
};
const label = (value: string) => labels[value] || "待处理";
const tabs = [{ id: "overview", name: "分析总览" }, { id: "platforms", name: "平台对照" },
  { id: "entities", name: "全部实体" }, { id: "sources", name: "来源文章" }, { id: "evidence", name: "证据片段" }, { id: "actions", name: "行动计划" }, { id: "facts", name: "批准事实" }, { id: "drafts", name: "内容草稿" }, { id: 'measurements', name: '固定样本复测' }];

async function jsonFetch<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "证据服务暂不可用");
  return data as T;
}

export default function IntelligencePage() {
  const { currentProjectId } = useProject();
  return currentProjectId ? <IntelligenceContent key={currentProjectId} currentProjectId={currentProjectId} />
    : <div><PageHeader title="证据分析" subtitle="完整回答、来源文章与逐平台证据" /><p className="mt-6">请先选择项目。</p></div>;
}

function IntelligenceContent({ currentProjectId }: { currentProjectId: string }) {
  const [runs, setRuns] = useState<EvidenceRunListItem[]>([]);
  const [runId, setRunId] = useState("");
  const [loadedRun, setLoadedRun] = useState<EvidenceRun | null>(null);
  const run = loadedRun?.id === runId ? loadedRun : null;
  const [enabled, setEnabled] = useState(false);
  const [tab, setTab] = useState("overview");
  const [platform, setPlatform] = useState("");
  const [auditId, setAuditId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [document, setDocument] = useState<{ kind: string; id: string; title: string; analysisRunId?: string } | null>(null);
  const [content, setContent] = useState<Array<{ id: string; text: string }>>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [captureId, setCaptureId] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const [capture, setCapture] = useState<{ status: string; expected_samples: number; sealed: number; failed: number; source_pending: number; analysis_pending: number; published_run_id: string | null; refresh_pending: boolean } | null>(null);
  useEffect(() => {
    if (!captureId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await jsonFetch<NonNullable<typeof capture>>(`/api/integration/intelligence?view=capture&projectId=${encodeURIComponent(currentProjectId)}&auditId=${captureId}`, controller.signal);
        setCapture(data);
        if (data.published_run_id) { setRunId(data.published_run_id); setRefresh(value => value + 1); }
        if (data.status === "running" || data.source_pending > 0 || data.analysis_pending > 0 || data.refresh_pending) timer = setTimeout(poll, 5000);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "采集状态读取失败"); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [captureId, currentProjectId, retrying]);

  useEffect(() => {
    if (!currentProjectId) return;
    const controller = new AbortController();
    jsonFetch<{ enabled: boolean; runs: EvidenceRunListItem[] }>(`/api/integration/intelligence?projectId=${encodeURIComponent(currentProjectId)}`, controller.signal)
      .then(data => { setRuns(data.runs); setEnabled(data.enabled);
        setRunId(previous => previous || data.runs[0]?.id || ""); setError(""); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentProjectId, refresh]);

  useEffect(() => {
    if (!currentProjectId || !runId) return;
    const controller = new AbortController();
    jsonFetch<EvidenceRun>(`/api/integration/intelligence?view=detail&projectId=${encodeURIComponent(currentProjectId)}&runId=${runId}`, controller.signal)
      .then(setLoadedRun).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [currentProjectId, runId, refresh]);

  useEffect(() => {
    if (!run || !["queued", "running"].includes(run.status)) return;
    const timer = setTimeout(() => setRefresh(value => value + 1), 5000);
    return () => clearTimeout(timer);
  }, [run]);

  useEffect(() => {
    if (!document || !runId || !currentProjectId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ view: "content", projectId: currentProjectId, runId: document.analysisRunId || runId,
      ownerKind: document.kind, ownerId: document.id, offset: String(offset) });
    jsonFetch<{ items: Array<{ id: string; text: string }>; next_offset: number | null }>(`/api/integration/intelligence?${params}`, controller.signal)
      .then(data => { setContent(data.items); setNextOffset(data.next_offset); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setContentLoading(false); });
    return () => controller.abort();
  }, [document, runId, currentProjectId, offset]);

  const open = (kind: string, id: string, title: string, analysisRunId?: string) => {
    setOffset(0); setNextOffset(null); setContent([]); setContentLoading(true); setDocument({ kind, id, title, analysisRunId });
  };
  const start = async () => {
    if (!currentProjectId || !/^[1-9][0-9]{0,17}$/.test(auditId)) { setError("请输入有效的审计编号"); return; }
    const initiatingProject = currentProjectId;
    setSubmitting(true); setError("");
    try {
      const created = await jsonFetch<EvidenceRun>("/api/integration/intelligence", undefined, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: initiatingProject, auditId }) });
      setDocument(null); setRunId(created.id); setRefresh(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "启动失败"); }
    finally { setSubmitting(false); }
  };
  const entities = run?.summary.entities || [];
  const retrySource = async (documentId: string) => {
    if (!run || retrying) return;
    const key = `${run.audit_id}:${documentId}`;
    const idempotencyKey = retryKeys.current.get(key) || crypto.randomUUID();
    retryKeys.current.set(key, idempotencyKey);
    setRetrying(documentId); setError("");
    try {
      await jsonFetch("/api/integration/intelligence", undefined, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId, action: "retrySource", auditId: run.audit_id, documentId, idempotencyKey }) });
      retryKeys.current.delete(key);
      setCaptureId(run.audit_id); setRefresh(value => value + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "来源补采失败"); }
    finally { setRetrying(null); }
  };
  const sources = (run?.sources || []).filter(source => !platform || source.platform === platform);
  const coverage = run?.coverage;
  const panel = "rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5";
  const activeRuns = runs;

  return <div className="space-y-6">
    <PageHeader title="证据分析" subtitle="从完整回答与来源文章，发现全部实体及各平台的证据差异" actions={<Link className="btn-secondary" href={`/intelligence/operations?${new URLSearchParams({ project: currentProjectId })}`}>运行诊断</Link>} />
    {!currentProjectId ? <div className={panel}>请先选择项目。</div> : <>
      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">{error}</div>}
      <CaptureControls projectId={currentProjectId} enabled={enabled} onCreated={id => { setCaptureId(id); setCapture(null); setAuditId(id); setRefresh(value => value + 1); }} />
      {capture && <p className="text-sm text-[var(--text-secondary)]">审计 {captureId}：已采集 {capture.sealed} / {capture.expected_samples}，失败 {capture.failed}，待补采文章 {capture.source_pending || 0}。{capture.refresh_pending ? "正在等待分析修订。" : ""}</p>}
      <div className={`${panel} flex flex-wrap items-center gap-3`}>
        <label className="text-sm">分析版本 <select aria-label="分析版本" className="ml-2 max-w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2" value={runId} onChange={e => { setCaptureId(""); setCapture(null); setDocument(null); setRunId(e.target.value); }}>
          <option value="">暂无分析</option>{activeRuns.map(item => <option key={item.id} value={item.id}>审计 {item.audit_id} · 修订 {item.revision} · {label(item.status)}</option>)}
        </select></label>
        <button aria-label="刷新分析" onClick={() => setRefresh(value => value + 1)} className="rounded-lg p-2 hover:bg-white/5">{loading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}</button>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto"><input aria-label="审计编号" placeholder="审计编号" inputMode="numeric" value={auditId} onChange={e => setAuditId(e.target.value)} className="w-32 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm" />
          <button disabled={!enabled || submitting} onClick={start} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--bg-base)] disabled:opacity-40">{submitting ? "启动中…" : "启动分析"}</button></div>
      </div>
      {!enabled && !loading && !error && <p className="text-sm text-[var(--text-secondary)]">分析服务尚未启用，完成存储与运行环境检查后可开始采集分析。</p>}
      <nav aria-label="证据分析视图" className="flex flex-wrap gap-2">{tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} aria-pressed={tab === item.id} className={`rounded-lg px-4 py-2 text-sm ${tab === item.id ? "bg-white/10 text-[var(--color-primary)]" : "text-[var(--text-secondary)] hover:bg-white/5"}`}>{item.name}</button>)}</nav>
      {!run && <div className={panel}>{runId ? "正在读取分析版本…" : "完成一次审计后，输入审计编号启动证据分析。"}</div>}
      {run && <>
        {tab === "drafts" && <DraftBriefs key={run.id} run={run} projectId={currentProjectId} />}
        {tab === 'measurements' && <><MeasurementCohorts key={run.id} run={run} runs={runs} projectId={currentProjectId} onOpenEvidence={(id, kind, ownerId) => open(kind, ownerId, "复测来源证据", id)} onCaptureStarted={id => { setCaptureId(id); setCapture(null); setRefresh(old => old + 1); }} /><PublishedAssets key={`assets-${run.id}`} run={run} projectId={currentProjectId} /></>}
        {tab === "facts" && <ApprovedFacts key={run.id} run={run} projectId={currentProjectId} />}
        {tab === "actions" && <ActionPlans key={run.id} run={run} projectId={currentProjectId} />}
        {tab === "evidence" && <EvidenceComparisons key={run.id} run={run} projectId={currentProjectId} onSaved={() => setRefresh(value => value + 1)} items={run.summary.claim_evidence} onSourceOpen={id => open("snapshot", id, "核验来源上下文")} />}
        {tab === "platforms" && <section className={panel}><h2 className="mb-3 font-semibold">同题采样分组</h2>{(run.summary.prompt_platforms || []).map((item, index) => <p key={index} className="mb-2 text-sm">{getAiPlatformLabel(item.platform)} · {item.prompt} · {item.sample_count} 次独立样本 · {item.comparable ? "条件已记录，仍需样本与口径复核" : "条件不足，仅作描述"}</p>)}</section>}
        <p className="text-sm text-[var(--text-secondary)]">当前为固定修订 {run.revision} · {label(run.status)}。补采会产生新修订，请刷新后选择；未分析与未知内容不计为品牌缺席。</p>
        {tab === "overview" && <><div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[
          ["采集回答", coverage?.responses || 0], ["已保存正文 / 来源", `${coverage?.captured_sources || 0} / ${coverage?.sources || 0}`],
          ["已分析字符 / 全文", `${coverage?.analyzed_characters || 0} / ${coverage?.total_characters || 0}`], ["发现实体", entities.length],
        ].map(([title, value]) => <div key={String(title)} className={panel}><p className="text-sm text-[var(--text-secondary)]">{title}</p><p className="mt-3 break-words text-2xl font-semibold">{value}</p></div>)}</div>
          <div className={panel}><h2 className="font-semibold">待核实事项</h2><p className="mt-2 text-sm text-[var(--text-secondary)]">正文保存成功不代表取得完整文章；同名实体仍需确认身份。观点与来源的支持关系未核实前标为待验证。</p>
            {(run.summary.diagnoses || []).map((item, index) => <p key={index} className="mt-3 text-sm">{getAiPlatformLabel(item.platform)}：{item.finding}</p>)}</div></>}
        {tab === "platforms" && <div className={panel}><h2 className="mb-4 font-semibold">逐平台覆盖</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="pb-3">平台</th><th>回答</th><th>全文分析完成</th><th>来源观测</th><th>正文版本</th></tr></thead><tbody>{(run.summary.platforms || []).map(item => <tr key={item.platform} className="border-t border-[var(--border)]"><td className="py-3">{getAiPlatformLabel(item.platform)}</td><td>{item.responses}</td><td>{item.analyzed_responses}</td><td>{item.source_observations}</td><td>{item.snapshot_count}</td></tr>)}</tbody></table></div>
          <h3 className="mt-6 mb-3 font-semibold">同题回答</h3>{run.responses.map(item => <button key={item.id} onClick={() => open("answer", item.id, item.prompt)} className="mb-2 block w-full rounded-lg border border-[var(--border)] p-3 text-left text-sm"><span className="text-[var(--color-primary)]">{getAiPlatformLabel(item.platform)}</span> · {item.prompt}{item.error && " · 采集失败"}</button>)}</div>}
        {tab === "entities" && <ProjectBrandBindings key={`brand-bindings-${run.id}`} projectId={currentProjectId} run={run} onSaved={() => setRefresh(value => value + 1)} />}
        {tab === "entities" && <ProjectBrandContext key={`brand-context-${currentProjectId}`} projectId={currentProjectId} refreshKey={refresh} onSaved={() => setRefresh(value => value + 1)} />}
        {tab === "entities" && <IdentityReview key={run.id} run={run} projectId={currentProjectId} onSaved={() => setRefresh(value => value + 1)} />}
        {tab === 'entities' && <EntityAliases key={`aliases-${run.id}`} run={run} projectId={currentProjectId} onSaved={() => setRefresh(value => value + 1)} />}
        {tab === 'entities' && <MentionBindings key={`bindings-${run.id}`} run={run} projectId={currentProjectId} onSaved={() => setRefresh(value => value + 1)} />}
        {tab === "platforms" && <PlatformDiagnoses items={run.summary.diagnoses} onAnswerOpen={id => open("answer", id, "诊断关联回答")} />}
        {tab === "entities" && <div className={`${panel} overflow-x-auto`}><p className="mb-4 text-sm text-[var(--text-secondary)]">包含全部发现实体。回答提及按独立回答去重，来源片段单列；候选身份不自动转换为竞品。</p><table className="w-full text-left text-sm"><thead><tr><th className="pb-3">实体</th><th>角色</th><th>回答提及</th><th>来源片段</th><th>各平台回答提及</th></tr></thead><tbody>{entities.map(entity => <tr key={entity.id} className="border-t border-[var(--border)]"><td className="py-3">{entity.name}<span className="ml-2 text-xs text-[var(--text-secondary)]">{entity.identity_status === "confirmed" ? "本修订身份已确认" : entity.identity_status === "excluded" ? "本修订已排除" : "身份待确认"}</span></td><td>{entity.role_conflict ? "角色冲突，需确认" : label(entity.role)}</td><td>{entity.response_count}</td><td>{entity.source_mentions}</td><td>{Object.entries(entity.platform_response_counts).map(([name, count]) => `${getAiPlatformLabel(name)} ${count}`).join(" · ") || "—"}</td></tr>)}</tbody></table>{!entities.length && <p className="py-6 text-sm text-[var(--text-secondary)]">暂无已验证的实体片段。请结合分析覆盖判断。</p>}</div>}
        {tab === "sources" && <div className="space-y-3"><select aria-label="来源平台" value={platform} onChange={e => setPlatform(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm"><option value="">全部平台</option>{Array.from(new Set(run.sources.map(item => item.platform))).map(name => <option key={name} value={name}>{getAiPlatformLabel(name)}</option>)}</select>
          {sources.map(source => <div key={source.id} className={panel}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">{source.title || "未取得来源标题"}</h2><p className="mt-2 break-all text-xs text-[var(--text-secondary)]">{source.url || "未取得精确地址"}</p></div><span className="text-xs">{getAiPlatformLabel(source.platform)} · {label(source.kind)} · {label(source.fetch_status)}</span></div>{source.snippet && <p className="mt-3 text-sm">{source.snippet}</p>}<div className="mt-4 flex gap-4 text-sm text-[var(--color-primary)]"><button onClick={() => open("answer", source.response_id, "引用该来源的回答")}>查看关联回答</button>{source.snapshot_id && <button onClick={() => open("snapshot", source.snapshot_id!, source.title)}>查看保存正文</button>}{source.document_id && source.fetch_status !== "captured" && <button disabled={!!retrying} onClick={() => retrySource(source.document_id!)} className="disabled:opacity-40">{retrying === source.document_id ? "提交中…" : "重试正文采集"}</button>}</div></div>)}
          {!sources.length && <div className={panel}>没有已采集的来源观测。</div>}</div>}
        {tab === "evidence" && <div className="space-y-3">{(run.summary.mentions || []).map(item => <div key={item.id} className={panel}><p className="text-sm text-[var(--text-secondary)]">{item.entity_name} · {label(item.owner_kind)}{item.identity_ambiguity && <span className="ml-2">同名归属待核对，不能判断独立主体是否缺席</span>}</p><blockquote className="mt-3 border-l-2 border-[var(--color-primary)] pl-4">{item.quote}</blockquote><button onClick={() => open(item.owner_kind, item.owner_id, "证据上下文")} className="mt-3 text-sm text-[var(--color-primary)]">查看原文上下文</button></div>)}{(run.summary.claims || []).map((item, index) => <div key={`${item.segment_id}-${index}`} className={panel}><p className="text-sm text-[var(--text-secondary)]">{item.subject || "观点"} · 支持关系待验证</p><blockquote className="mt-3 border-l-2 border-[var(--color-primary)] pl-4">{item.quote}</blockquote></div>)}{!run.summary.mentions?.length && !run.summary.claims?.length && <div className={panel}>暂无已验证的证据片段。</div>}</div>}
      </>}
    </>}
    {document && run && <section aria-label="原文上下文" className={panel}><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{document.title || "保存正文"}</h2><button onClick={() => setDocument(null)} className="text-sm">关闭</button></div>{contentLoading ? <p className="py-6">正在读取原文…</p> : content.map(item => <p key={item.id} className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{item.text}</p>)}<div className="mt-5 flex gap-4 text-sm"><button disabled={offset === 0 || contentLoading} onClick={() => setOffset(value => Math.max(0, value - 20))} className="disabled:opacity-40">上一页</button><button disabled={nextOffset === null || contentLoading} onClick={() => setOffset(nextOffset || 0)} className="disabled:opacity-40">下一页</button></div></section>}
  </div>;
}
