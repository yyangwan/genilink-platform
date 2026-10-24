"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from 'next/navigation';
import { BrandScoreWorkspace } from '@/components/visibility/brand-score-workspace';
import { ResultReadiness } from '@/components/visibility/result-readiness';
import { EvaluationCohortReview } from '@/components/visibility/evaluation-cohort-review';
import { CaptureProgress } from '@/components/visibility/capture-progress';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import { Loader2, RefreshCw } from "lucide-react";
import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";
import type { EvidenceRun, EvidenceRunListItem } from "@/types/intelligence";
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
import { ActionIntro, CitationViewNav, citationViews, DraftEvidenceSummary, EntityComparison, EvidenceWorkspace, MeasurementBaseline, PlatformComparison, SourceLibrary, WorkflowIntro } from "@/components/visibility/citation-prototype-views";

const labels: Record<string, string> = {
  queued: "排队中", running: "分析中", ready: "已完成", partial: "部分完成", failed: "失败",
  captured: "正文已保存", pending: "等待抓取", blocked: "访问受限", unavailable: "无法取得", unknown: "待确认",
  own: "自有品牌", competitor: "已登记竞品", unregistered: "未登记或未确认绑定", comparison: "仅用于对比", answer_reference: "回答引用",
  search_candidate: "搜索候选", text_link: "文本链接", named_inference: "推测来源", answer: "回答", snapshot: "来源正文", citation: "来源摘要",
};
const label = (value: string) => labels[value] || "待处理";


async function jsonFetch<T>(url: string, signal?: AbortSignal, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "证据服务暂不可用");
  return data as T;
}

export default function IntelligencePage() { return <Suspense fallback={<p>正在加载证据分析…</p>}><IntelligenceRoot /></Suspense>; }

function IntelligenceRoot() {
  const { currentProjectId } = useProject();
  return currentProjectId ? <IntelligenceContent key={currentProjectId} currentProjectId={currentProjectId} />
    : <div><PageHeader title="证据分析" subtitle="完整回答、来源文章与逐平台证据" /><p className="mt-6">请先选择项目。</p></div>;
}

function IntelligenceContent({ currentProjectId }: { currentProjectId: string }) {
  const search = useSearchParams(), router = useRouter();
  const initialAudit = search.get('project') === currentProjectId && /^[1-9][0-9]{0,17}$/.test(search.get('auditId') || '') ? search.get('auditId')! : '';
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [runs, setRuns] = useState<EvidenceRunListItem[]>([]);
  const [runId, setRunId] = useState(search.get("project") === currentProjectId ? search.get("runId") || "" : "");
  const [loadedRun, setLoadedRun] = useState<EvidenceRun | null>(null);
  const run = loadedRun?.id === runId ? loadedRun : null;
  const [enabled, setEnabled] = useState(false);
  const requestedView = search.get("view") || "";
  const tab = requestedView === "facts" || citationViews.some(view => view.id === requestedView) ? requestedView : "overview";
  const viewMeta = citationViews.find(view => view.id === tab) ||
    (tab === "facts" ? { eyebrow: "FACT REVIEW", title: "批准事实", heading: "核对已批准的品牌事实", subtitle: "对内容行动使用的事实作独立核对。" } : citationViews[0]);
  const [auditId, setAuditId] = useState(initialAudit);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const [awaitingRevision, setAwaitingRevision] = useState<number | null>(null);
  const [document, setDocument] = useState<{ kind: string; id: string; title: string; analysisRunId?: string } | null>(null);
  const [content, setContent] = useState<Array<{ id: string; text: string }>>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [contentError, setContentError] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [captureId, setCaptureId] = useState(search.get("runId") ? "" : initialAudit);
  const [captureExpanded, setCaptureExpanded] = useState(!!initialAudit && !search.get("runId"));
  const [retrying, setRetrying] = useState<string | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const published = useCallback((id: string) => { setRunId(id); setRefresh(value => value + 1); }, []);
  const changeTab = (id: string) => {
    const params = new URLSearchParams({ project: currentProjectId, view: id });
    if (captureId || run?.audit_id) params.set('auditId', captureId || run!.audit_id);
    if (runId) params.set('runId', runId);
    router.replace(`/intelligence?${params}`, { scroll: false });
  };

  useEffect(() => {
    if (!currentProjectId) return;
    const controller = new AbortController();
    jsonFetch<{ enabled: boolean; runs: EvidenceRunListItem[] }>(`/api/integration/intelligence?projectId=${encodeURIComponent(currentProjectId)}`, controller.signal)
      .then(data => { setRuns(data.runs); setEnabled(data.enabled);
        setRunId(previous => previous || data.runs.find(item => !captureId || item.audit_id === captureId)?.id || ""); setError(""); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [currentProjectId, refresh, captureId]);

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
    if (!run || awaitingRevision === null || run.revision > awaitingRevision || runs.some(item => item.audit_id === run.audit_id && item.revision > awaitingRevision && ['ready', 'partial', 'failed'].includes(item.status))) return;
    const timer = setTimeout(() => setRefresh(value => value + 1), 5000);
    return () => clearTimeout(timer);
  }, [run, runs, awaitingRevision]);

  useEffect(() => {
    if (!document || !runId || !currentProjectId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ view: "content", projectId: currentProjectId, runId: document.analysisRunId || runId,
      ownerKind: document.kind, ownerId: document.id, offset: String(offset) });
    jsonFetch<{ items: Array<{ id: string; text: string }>; next_offset: number | null }>(`/api/integration/intelligence?${params}`, controller.signal)
      .then(data => { setContent(data.items); setNextOffset(data.next_offset); })
      .catch(e => { if (!controller.signal.aborted) setContentError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setContentLoading(false); });
    return () => controller.abort();
  }, [document, runId, currentProjectId, offset]);

  const open = (kind: string, id: string, title: string, analysisRunId?: string) => {
    setContentError(""); setOffset(0); setNextOffset(null); setContent([]); setContentLoading(true); setDocument({ kind, id, title, analysisRunId });
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
  const panel = "rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5";
  const activeRuns = runs;

  return <div className="audit-workspace citation-workspace">
    <header className="citation-page-head">
      <div><span>{viewMeta.eyebrow}</span><h1>{viewMeta.heading}</h1><p>{viewMeta.subtitle}</p></div>
      <div className="citation-page-actions">
        <Link className="dashboard-button dashboard-button--secondary" href="/visibility">采集任务</Link>
        {(run?.audit_id || captureId) && <Link className="dashboard-button dashboard-button--secondary"
          href={`/audits/${run?.audit_id || captureId}/report?project=${encodeURIComponent(currentProjectId)}`}>报告指标与 PDF</Link>}
        <Link className="dashboard-button dashboard-button--secondary" href={"/intelligence/operations?" + new URLSearchParams({ project: currentProjectId })}>运行诊断</Link>
      </div>
    </header>
    {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm">{error}</div>}
    <div className="citation-context-bar">
      <label>当前审计与分析版本
        <select aria-label="分析版本" value={runId} onChange={event => {
          setCaptureId(""); setDocument(null); setRunId(event.target.value);
          const selected = runs.find(item => item.id === event.target.value);
          if (selected) router.replace("/intelligence?" + new URLSearchParams({
            project: currentProjectId, auditId: selected.audit_id, runId: selected.id, view: tab,
          }), { scroll: false });
        }}>
          <option value="">暂无分析</option>
          {activeRuns.map(item => <option key={item.id} value={item.id}>审计 {item.audit_id} · 修订 {item.revision} · {label(item.status)}</option>)}
        </select>
      </label>
      <span>{run ? "审计 #" + run.audit_id + " · 修订 " + run.revision + " · " + label(run.status) : "等待分析版本"}</span>
      <button aria-label="刷新分析" onClick={() => setRefresh(value => value + 1)}>{loading ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />} 刷新</button>
    </div>
    {tab === "overview" && <details className="citation-capture-details" open={captureExpanded}
      onToggle={event => setCaptureExpanded(event.currentTarget.open)}>
      <summary>本次任务进度 <span>查看各平台进度、来源归档与分析状态</span></summary>
      {(captureId || run?.audit_id) && <CaptureProgress key={retrying || "task"} projectId={currentProjectId}
        auditId={captureId || run!.audit_id} onPublished={captureId ? published : undefined} />}
      <div className="citation-analysis-trigger">
        <input aria-label="审计编号" placeholder="审计编号" inputMode="numeric" value={auditId}
          onChange={event => setAuditId(event.target.value)} />
        <button disabled={!enabled || submitting} onClick={start}>{submitting ? "启动中…" : "启动分析"}</button>
      </div>
    </details>}
    {!enabled && !loading && !error && <p className="citation-notice citation-notice--warning">分析服务尚未启用，请先检查存储与运行环境。</p>}
    <CitationViewNav value={tab} onChange={changeTab} />
    {!run && <div className="citation-panel citation-empty">{runId ? "正在读取分析版本…" : "完成一次审计后，在审计洞察中选择分析版本。尚无结果时不会填入示例数据。"}</div>}
    {run && <div className="citation-result" aria-label={viewMeta.title}>
      {runs.filter(item => item.audit_id === run.audit_id && item.revision > run.revision && ['ready', 'partial', 'failed'].includes(item.status)).sort((a, b) => b.revision - a.revision).slice(0, 1).map(item => <div key={item.id} role="status" className="citation-notice"><div>新分析修订 {item.revision} {item.status === 'failed' ? '分析尚未成功，可查看处理状态' : '已就绪'}，当前仍显示修订 {run.revision}。</div><button type="button" className="citation-link" onClick={() => { setRunId(item.id); setReviewRunId(null); setAwaitingRevision(null); router.replace('/intelligence?' + new URLSearchParams({ project: currentProjectId, auditId: item.audit_id, runId: item.id, view: tab }), { scroll: false }); }}>查看新修订 →</button></div>)}
      {["overview", "entities", "platforms"].includes(tab) && <BrandScoreWorkspace key={run.id + tab} run={run} mode={tab === "entities" ? "brands" : tab === "platforms" ? "platforms" : "overview"} onEvidence={id => open("answer", id, "评分依据：原始回答")} onPlatformSelect={setSelectedPlatform} readinessPanel={tab === 'overview' ? <ResultReadiness readiness={run.readiness} onRemedy={remedy => {
        if (remedy.action === 'review_prompt_scope') setReviewRunId(run.id);
        else if (remedy.view === 'capture') router.push('/visibility?' + new URLSearchParams({ project: currentProjectId, auditId: run.audit_id }));
        else changeTab(remedy.view);
      }} /> : undefined} />}

      {tab === "platforms" && <PlatformComparison key={run.id} run={run}
        selectedPlatform={selectedPlatform} onPlatformChange={setSelectedPlatform} onOpenAnswer={id => open("answer", id, "同题原始回答")} onView={changeTab} />}
      {tab === "entities" && <>
        <EntityComparison run={run} onReview={() => {
          const details = globalThis.document.getElementById("citation-entity-review") as HTMLDetailsElement | null;
          if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "start" }); }
        }} />
        <details open id="citation-entity-review" className="citation-deep-details"><summary>品牌身份确认与项目名单管理</summary>
          <ProjectBrandBindings key={"brand-bindings-" + run.id} projectId={currentProjectId} run={run} onSaved={() => setRefresh(value => value + 1)} />
          <ProjectBrandContext key={"brand-context-" + currentProjectId} projectId={currentProjectId} refreshKey={refresh} onSaved={() => setRefresh(value => value + 1)} />
          <IdentityReview key={run.id} run={run} projectId={currentProjectId} onSaved={() => setRefresh(value => value + 1)} />
          <EntityAliases key={"aliases-" + run.id} run={run} projectId={currentProjectId} onSaved={() => setRefresh(value => value + 1)} />
          <MentionBindings key={"bindings-" + run.id} run={run} projectId={currentProjectId} onSaved={() => setRefresh(value => value + 1)} />
        </details>
      </>}
      {tab === "sources" && <SourceLibrary key={run.id} run={run} retrying={retrying}
        onOpenAnswer={id => open("answer", id, "引用该来源的回答")}
        onOpenSource={(id, title) => open("snapshot", id, title)}
        onRetry={retrySource} />}
      {tab === "evidence" && <>
        <EvidenceWorkspace key={run.id} run={run} projectId={currentProjectId}
          onSaved={() => setRefresh(value => value + 1)}
          onSourceOpen={id => open("snapshot", id, "核验来源上下文")} onView={changeTab} />
        {!!run.summary.mentions?.length && <details className="citation-deep-details"><summary>查看全部实体原文提及</summary>
          {run.summary.mentions.map(item => <div key={item.id} className="citation-mention">
            <strong>{item.entity_name} · {label(item.owner_kind)}</strong><blockquote>{item.quote}</blockquote>
            <button onClick={() => open(item.owner_kind, item.owner_id, "证据上下文")}>查看原文上下文 →</button>
          </div>)}</details>}
      </>}
      {tab === "actions" && <>
        <ActionIntro run={run} onView={changeTab} />
        <details className="citation-deep-details"><summary>创建和审批行动计划</summary>
          <ActionPlans key={run.id} run={run} projectId={currentProjectId} />
        </details>
        <button className="citation-link" onClick={() => changeTab("facts")}>核对已批准品牌事实 →</button>
      </>}
      {tab === "facts" && <ApprovedFacts key={run.id} run={run} projectId={currentProjectId} />}
      {tab === "drafts" && <>
        <WorkflowIntro kind="drafts" projectId={currentProjectId} />
        <div className="citation-draft-grid">
          <DraftBriefs key={run.id} run={run} projectId={currentProjectId} />
          <DraftEvidenceSummary run={run} />
        </div>
      </>}
      {tab === "measurements" && <>
        <WorkflowIntro kind="measurements" projectId={currentProjectId} />
        <MeasurementBaseline run={run} />
        <MeasurementCohorts key={run.id} run={run} runs={runs} projectId={currentProjectId}
          onOpenEvidence={(id, kind, ownerId) => open(kind, ownerId, "复测来源证据", id)}
          onCaptureStarted={id => router.push(`/visibility?${new URLSearchParams({ project: currentProjectId, auditId: id })}`)} />
        <PublishedAssets key={"assets-" + run.id} run={run} projectId={currentProjectId} />
      </>}
      <p className="citation-method-note">当前为固定修订 {run.revision} · {label(run.status)}。未分析与未知内容不计为品牌缺席；后续补采会产生新修订。</p>
    </div>}
    {run && reviewRunId === run.id && <ReadingDrawer title="确认本次竞争评价的问题范围" eyebrow="问题资格审核" closeLabel="关闭审核" onClose={() => setReviewRunId(null)}><EvaluationCohortReview key={currentProjectId + run.id} projectId={currentProjectId} run={run} onSaved={() => { setAwaitingRevision(run.revision); setRefresh(value => value + 1); }} /></ReadingDrawer>}
    {document && run && <ReadingDrawer title={document.title || "保存正文"} onClose={() => setDocument(null)}>{contentLoading ? <p className="py-6">正在读取原文…</p> : contentError ? <p role="alert">{contentError}</p> : content.map(item => <p key={item.id} className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{item.text}</p>)}<div className="mt-5 flex gap-4 text-sm"><button disabled={offset === 0 || contentLoading} onClick={() => { setContentLoading(true); setContentError(""); setOffset(value => Math.max(0, value - 20)); }} className="dashboard-button dashboard-button--secondary">上一页</button><button disabled={nextOffset === null || contentLoading} onClick={() => { setContentLoading(true); setContentError(""); setOffset(nextOffset || 0); }} className="dashboard-button dashboard-button--secondary">下一页</button></div></ReadingDrawer>}
  </div>;
}
