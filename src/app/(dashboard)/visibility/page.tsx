"use client";

import React, { Suspense, useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Eye,
  BarChart3,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Play,
  Loader2,
  CheckCircle2,
  Settings,
  Calendar,
  Trophy,
  Lightbulb,
} from "lucide-react";
import dynamic from "next/dynamic";

const PlatformCoverageChart = dynamic(
  () => import("@/components/charts/PlatformCoverageChart"),
  { ssr: false },
);
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import {
  DiagnosticChecklist,
  type DiagnosticItem,
} from "@/components/ui/diagnostic-checklist";
import { PageHeader } from "@/components/ui/page-header";
import type { VisibilitySummary } from "@/types";
import { sectionCard } from "@/components/charts/shared";
import { formatDateInTimeZone } from "@/lib/time";

type AnalysisPhase = "idle" | "creating" | "collecting" | "analyzing" | "done" | "error";

const PLATFORM_LABELS: Record<string, string> = {
  deepseek: "DeepSeek",
  qwen: "通义千问",
  doubao: "豆包",
  kimi: "Kimi",
  hunyuan: "腾讯元宝",
};

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-primary)";
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}

function VisibilityContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();

  // Fetch visibility data for current project
  const visibilityUrl = currentProjectId
    ? `/api/dashboard/visibility?project=${currentProjectId}`
    : null;
  const visibility = useSectionFetch<VisibilitySummary>(visibilityUrl);

  // Analysis state
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisDetail, setAnalysisDetail] = useState<string>("");
  const [currentAuditId, setCurrentAuditId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analysisPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const finalizedAuditRef = useRef<string | null>(null);

  const closeAuditStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const clearAnalysisPoll = useCallback(() => {
    if (analysisPollRef.current) {
      clearInterval(analysisPollRef.current);
      analysisPollRef.current = null;
    }
  }, []);

  const triggerAuditAnalysis = useCallback(async (auditId: string, projectId: string | null) => {
    if (!projectId) return;
    if (finalizedAuditRef.current === auditId) return;
    finalizedAuditRef.current = auditId;

    try {
      await fetch(`/api/integration/audits/${auditId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
    } catch {
      // Best effort.
    }
  }, []);

  const finalizeAudit = useCallback(async (auditId: string, projectId: string | null) => {
    closeAuditStream();
    setCurrentAuditId(null);
    setAnalysisPhase("analyzing");
    setAnalysisDetail("审计完成，正在生成内容洞察...");

    await triggerAuditAnalysis(auditId, projectId);

    clearAnalysisPoll();
    if (!projectId) return;

    analysisPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/integration/content-intelligence?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) return;
        const data = await res.json() as {
          sentiment?: { positive?: number; neutral?: number; negative?: number };
          topics?: unknown[];
          sources?: unknown[];
          answerStructure?: unknown[];
        };

        const sentiment = data.sentiment || {};
        const hasData =
          (sentiment.positive ?? 0) + (sentiment.neutral ?? 0) + (sentiment.negative ?? 0) > 0 ||
          (data.topics?.length ?? 0) > 0 ||
          (data.sources?.length ?? 0) > 0 ||
          (data.answerStructure?.length ?? 0) > 0;

        if (!hasData) return;

        clearAnalysisPoll();
        setAnalysisPhase("done");
        setAnalysisDetail("分析完成，正在刷新数据...");
        visibility.refetch();

        fetch(`/api/integration/audits/${auditId}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        })
          .then((r) => r.ok ? fetch("/api/integration/suggestions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId }),
          }) : Promise.reject())
          .catch(() => { /* non-critical */ });
      } catch {
        // keep polling
      }
    }, 3000);
  }, [clearAnalysisPoll, closeAuditStream, triggerAuditAnalysis, visibility]);

  const openAuditStream = useCallback((auditId: string, projectId: string | null) => {
    closeAuditStream();

    if (typeof window === "undefined") return;
    if (!projectId) return;

    const source = new EventSource(
      `/api/integration/audit-status?auditId=${encodeURIComponent(auditId)}&projectId=${encodeURIComponent(projectId)}`,
    );
    eventSourceRef.current = source;

    source.addEventListener("platform_start", (rawEvent) => {
      const event = rawEvent as MessageEvent;
      try {
        const payload = JSON.parse(String(event.data)) as { platform?: string };
        const label = payload.platform ? PLATFORM_LABELS[payload.platform] ?? payload.platform : "平台";
        setAnalysisPhase("collecting");
        setAnalysisDetail(`正在查询 ${label}...`);
      } catch {
        setAnalysisPhase("collecting");
        setAnalysisDetail("正在查询平台...");
      }
    });

    source.addEventListener("platform_done", (rawEvent) => {
      const event = rawEvent as MessageEvent;
      try {
        const payload = JSON.parse(String(event.data)) as { platform?: string };
        const label = payload.platform ? PLATFORM_LABELS[payload.platform] ?? payload.platform : "平台";
        setAnalysisPhase("collecting");
        setAnalysisDetail(`${label} 查询完成，继续处理其他平台...`);
      } catch {
        setAnalysisPhase("collecting");
        setAnalysisDetail("平台查询完成，继续处理其他平台...");
      }
    });

    source.addEventListener("platform_error", (rawEvent) => {
      const event = rawEvent as MessageEvent;
      try {
        const payload = JSON.parse(String(event.data)) as { platform?: string };
        const label = payload.platform ? PLATFORM_LABELS[payload.platform] ?? payload.platform : "平台";
        setAnalysisPhase("collecting");
        setAnalysisDetail(`${label} 查询失败，继续处理剩余平台...`);
      } catch {
        setAnalysisPhase("collecting");
        setAnalysisDetail("某个平台查询失败，继续处理剩余平台...");
      }
    });

    source.addEventListener("audit_done", () => {
      void finalizeAudit(auditId, currentProjectId);
      return;
      closeAuditStream();
      setCurrentAuditId(null);
      setAnalysisPhase("done");
      setAnalysisDetail("分析完成，正在刷新数据...");
      visibility.refetch();
      if (currentProjectId) {
        fetch(`/api/integration/audits/${auditId}/report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId }),
        })
          .then((r) => r.ok ? fetch("/api/integration/suggestions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: currentProjectId }),
          }) : Promise.reject())
          .catch(() => { /* non-critical */ });
      }
    });

    source.addEventListener("audit_failed", (rawEvent) => {
      closeAuditStream();
      setCurrentAuditId(null);
      setAnalysisPhase("error");
      try {
        const payload = JSON.parse(String((rawEvent as MessageEvent).data)) as { error?: string };
        setAnalysisError(payload.error || "分析失败");
      } catch {
        setAnalysisError("分析失败");
      }
      setAnalysisDetail("");
    });

    source.onerror = () => {
      // SSE is best-effort; polling remains the fallback.
    };
  }, [closeAuditStream, currentProjectId, finalizeAudit, visibility]);

  useEffect(() => {
    if (!currentAuditId) return;
    openAuditStream(currentAuditId, currentProjectId);
    return () => closeAuditStream();
  }, [closeAuditStream, currentAuditId, currentProjectId, openAuditStream]);

  // Extract polling logic so it can be reused for resume
  const startPolling = useCallback((auditId: string, projectId: string | null) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!projectId) return;
    pollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/integration/audits/${auditId}?projectId=${encodeURIComponent(projectId)}`);
        if (!statusRes.ok) return;
        const status = await statusRes.json();
        const phase = status.phase || status.status;

        if (phase === "collecting" || phase === "pending") {
          setAnalysisPhase("collecting");
        } else if (phase === "analyzing" || phase === "running") {
          setAnalysisPhase("analyzing");
        } else if (phase === "completed" || phase === "done" || phase === "partial") {
          if (pollRef.current) clearInterval(pollRef.current);
          void finalizeAudit(auditId, projectId);
          return;
          closeAuditStream();
          setCurrentAuditId(null);
          setAnalysisPhase("done");
          visibility.refetch();
          // Chain: generate report → generate suggestions
          if (currentProjectId) {
            fetch(`/api/integration/audits/${auditId}/report`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId: currentProjectId }),
            })
              .then((r) => r.ok ? fetch("/api/integration/suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: currentProjectId }),
              }) : Promise.reject())
              .catch(() => { /* non-critical */ });
          }
        } else if (phase === "failed" || phase === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          closeAuditStream();
          setCurrentAuditId(null);
          setAnalysisPhase("error");
          setAnalysisError(status.error_message || "分析失败");
        }
      } catch {
        // Poll errors are transient, keep trying
      }
    }, 3000);
  }, [currentProjectId, finalizeAudit, visibility]);

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearAnalysisPoll();
      closeAuditStream();
    };
  }, [clearAnalysisPoll, closeAuditStream]);

  // On mount, check for an active audit and resume polling
  React.useEffect(() => {
    if (!currentProjectId) return;

    const checkActiveAudit = async () => {
      try {
        const res = await fetch(`/api/integration/audits?projectId=${currentProjectId}`);
        if (!res.ok) return;
        const audits = await res.json();

        const active = Array.isArray(audits) && audits.find((a: Record<string, unknown>) => {
          const p = (a.phase as string) || (a.status as string);
          return p === "collecting" || p === "pending" || p === "analyzing" || p === "running";
        });

        if (!active) return;

        const auditId = (active.id as string) || (active.audit_id as string);
        if (!auditId) return;

        const phase = (active.phase as string) || (active.status as string);
        setAnalysisPhase(phase === "analyzing" || phase === "running" ? "analyzing" : "collecting");
        setAnalysisDetail(phase === "analyzing" || phase === "running" ? "正在分析平台返回结果..." : "正在收集平台数据...");
        setCurrentAuditId(auditId);
        startPolling(auditId, currentProjectId);
      } catch {
        // non-critical
      }
    };

    checkActiveAudit();
  }, [currentProjectId, startPolling]);

  const handleStartAnalysis = useCallback(async () => {
    if (!currentProjectId) return;

    setAnalysisPhase("creating");
    setAnalysisError(null);
    setAnalysisDetail("正在检查提示词和品牌数据...");

    try {
      const [promptsRes, brandsRes] = await Promise.all([
        fetch(`/api/integration/prompts?projectId=${currentProjectId}`),
        fetch(`/api/projects/${currentProjectId}/brands`),
      ]);

      const promptsData = promptsRes.ok ? await promptsRes.json() : [];
      const brandsData = brandsRes.ok ? await brandsRes.json() : {};

      const promptList = Array.isArray(promptsData) ? promptsData : [];
      const hasPrompts = promptList.length > 0;
      const hasBrands = Array.isArray(brandsData.brands) && brandsData.brands.length > 0;

      if (!hasBrands) {
        setAnalysisPhase("error");
        setAnalysisError("NO_BRANDS");
        setAnalysisDetail("");
        return;
      }

      if (!hasPrompts) {
        setAnalysisPhase("creating");
        setAnalysisDetail("当前没有提示词，正在自动生成...");

        const generateRes = await fetch("/api/integration/prompts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId }),
        });

        if (!generateRes.ok) {
          throw new Error("PROMPTS_GENERATE_FAILED");
        }

        setAnalysisDetail("提示词已生成，正在创建审计...");
      }

      setAnalysisPhase("creating");
      setAnalysisDetail("正在创建审计...");
      const createRes = await fetch("/api/integration/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: currentProjectId }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error || "创建审计失败");
      }

      const audit = await createRes.json();
      const auditId = audit.id || audit.audit_id;

      if (!auditId) {
        throw new Error("未获取到审计 ID");
      }

      setAnalysisPhase("collecting");
      setAnalysisDetail("审计已启动，正在收集平台数据...");
      setCurrentAuditId(auditId);
      startPolling(auditId, currentProjectId);
    } catch (err) {
      setAnalysisPhase("error");
      setAnalysisError((err as Error).message);
      setAnalysisDetail("");
    }
  }, [currentProject, currentProjectId, startPolling]);

  const phaseText: Record<AnalysisPhase, string> = {
    idle: "",
    creating: "正在创建审计...",
    collecting: "数据采集中...",
    analyzing: "AI 分析中...",
    done: "分析完成",
    error: analysisError === "NO_BRANDS"
      ? "请先在设置中添加品牌"
      : analysisError === "PROMPTS_GENERATE_FAILED"
      ? "提示词自动生成失败，请在设置中手动管理"
      : analysisError || "分析失败",
  };

  const isAnalyzing = analysisPhase === "creating" || analysisPhase === "collecting" || analysisPhase === "analyzing";

  // No project selected state
  if (!loading && !currentProjectId) {
    const diagnosticItems: DiagnosticItem[] = [
      {
        id: "project",
        label: "创建项目",
        status: projects.length === 0 ? "incomplete" : "complete",
        actionLabel: "创建",
        onAction: () => openWizard(),
      },
      {
        id: "product",
        label: "完善产品信息",
        status: currentProject?.productName ? "complete" : "incomplete",
      },
    ];

    return (
      <div className="space-y-6">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sectionHeading)",
            }}
          >
            智見
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
            AI搜索可见性分析与品牌监控
          </p>
        </div>
        <DiagnosticChecklist items={diagnosticItems} title="准备工作" />
      </div>
    );
  }

  const hasData = visibility.data && (visibility.data.overallScore != null || visibility.data.mentionCount > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="智见"
        subtitle={`AI搜索可见性分析与品牌监控${currentProject ? ` · ${currentProject.name}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {currentProjectId && analysisPhase === "idle" && (
              <button onClick={handleStartAnalysis} className="dashboard-button dashboard-button--primary">
                <Play className="h-3.5 w-3.5" />
                开始 AI 分析
              </button>
            )}

            {isAnalyzing && (
              <div className="dashboard-chip" style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {phaseText[analysisPhase]}
              </div>
            )}

            {analysisPhase === "done" && (
              <div className="dashboard-chip" style={{ background: "var(--color-success)20", color: "var(--color-success)" }}>
                <CheckCircle2 className="h-3.5 w-3.5" />
                分析完成
              </div>
            )}

            {analysisPhase === "error" &&
              (analysisError === "NO_BRANDS" ? (
                <Link href="/settings/brands" className="dashboard-button dashboard-button--secondary">
                  <Settings className="h-3.5 w-3.5" />
                  请先添加品牌
                </Link>
              ) : analysisError === "PROMPTS_GENERATE_FAILED" ? (
                <Link href="/settings/prompts" className="dashboard-button dashboard-button--secondary">
                  <Lightbulb className="h-3.5 w-3.5" />
                  手动管理提示词
                </Link>
              ) : (
                <button onClick={handleStartAnalysis} className="dashboard-button dashboard-button--secondary">
                  重试分析
                </button>
              ))}

            <button onClick={visibility.refetch} className="dashboard-button dashboard-button--secondary">
              <RefreshCw className={`h-3.5 w-3.5 ${visibility.loading ? "animate-spin" : ""}`} />
              刷新
            </button>
          </div>
        }
      />

      {/* Progress bar during analysis */}
      {isAnalyzing && (
        <>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: "var(--bg-card)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: analysisPhase === "creating" ? "10%" : analysisPhase === "collecting" ? "40%" : "70%",
                background: "var(--color-primary)",
              }}
            />
          </div>
          {analysisDetail && (
            <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              {analysisDetail}
            </p>
          )}
        </>
      )}

      {/* Two-column hero layout */}
      {!hasData && !isAnalyzing ? (
        /* Empty state — no data yet */
        <div className="dashboard-surface dashboard-surface--padded">
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-10 h-10 mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              {visibility.error ? "数据加载失败，请稍后重试" : "暂无可见性数据 — 点击「开始 AI 分析」获取数据"}
            </p>
            {!visibility.error && currentProjectId && analysisPhase === "idle" && (
              <button
                onClick={handleStartAnalysis}
                className="flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", background: "none", border: "none", cursor: "pointer" }}
              >
                开始 AI 分析
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left column — Hero score + Platform strip */}
          <div className="lg:col-span-2 space-y-4">
            {/* Hero score card */}
            <div
              className="dashboard-surface dashboard-surface--padded flex flex-col items-center justify-center text-center"
              style={{ borderLeft: `4px solid ${scoreColor(visibility.data?.overallScore)}`, minHeight: 180 }}
            >
              {visibility.loading ? (
                <div className="dashboard-skeleton h-16 w-24" />
              ) : (
                <>
                  <span
                    className="font-bold"
                    style={{
                      fontSize: 56,
                      lineHeight: 1.1,
                      color: scoreColor(visibility.data?.overallScore),
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {visibility.data?.overallScore ?? "--"}
                  </span>
                  <span
                    className="text-sm mt-1"
                    style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                  >
                    AI可见性综合得分
                  </span>
                </>
              )}
            </div>

            {/* Platform strip */}
            <div className="dashboard-surface dashboard-surface--padded">
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                AI平台覆盖
              </h3>
              {visibility.loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="dashboard-skeleton h-5" />
                  ))}
                </div>
              ) : visibility.data?.platformCoverage && visibility.data.platformCoverage.length > 0 ? (
                <div style={{ height: 200 }}>
                  <PlatformCoverageChart data={visibility.data.platformCoverage} />
                </div>
              ) : (
                <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  暂无平台数据
                </p>
              )}
            </div>
          </div>

          {/* Right column — KPI grid + Findings + Quick links */}
          <div className="lg:col-span-3 space-y-4">
            {/* 2×2 KPI grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="dashboard-surface dashboard-surface--padded">
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    品牌提及
                  </span>
                </div>
                {visibility.loading ? (
                  <div className="dashboard-skeleton h-7 w-14" />
                ) : (
                  <span className="text-xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {visibility.data?.mentionCount ?? "--"}
                  </span>
                )}
              </div>
              <div className="dashboard-surface dashboard-surface--padded">
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    竞品排名
                  </span>
                </div>
                {visibility.loading ? (
                  <div className="dashboard-skeleton h-7 w-14" />
                ) : (
                  <span className="text-xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {visibility.data?.competitorRank ? `#${visibility.data.competitorRank}` : "--"}
                  </span>
                )}
              </div>
              <div className="dashboard-surface dashboard-surface--padded">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    最近审计
                  </span>
                </div>
                {visibility.loading ? (
                  <div className="dashboard-skeleton h-7 w-14" />
                ) : (
                  <span className="text-base font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                    {visibility.data?.latestAuditDate
                      ? formatDateInTimeZone(visibility.data.latestAuditDate, { includeTime: false })
                      : "--"}
                  </span>
                )}
              </div>
              <div className="dashboard-surface dashboard-surface--padded">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    可见性得分
                  </span>
                </div>
                {visibility.loading ? (
                  <div className="dashboard-skeleton h-7 w-14" />
                ) : (
                  <span className="text-xl font-bold" style={{ color: scoreColor(visibility.data?.overallScore), fontFamily: "var(--font-mono)" }}>
                    {visibility.data?.overallScore != null ? `${visibility.data.overallScore}/100` : "--"}
                  </span>
                )}
              </div>
            </div>

            {/* Key findings / Suggestions */}
            {visibility.data?.suggestions && visibility.data.suggestions.length > 0 && (
              <div style={sectionCard}>
                <div className="flex items-center gap-2 mb-3">
                  <Lightbulb className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
                  <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                    关键发现
                  </h3>
                </div>
                <ul className="space-y-2">
                  {visibility.data.suggestions.slice(0, 4).map((s: { priority: string; text: string }, i: number) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 py-1.5"
                    >
                      <span
                        className="inline-flex items-center justify-center shrink-0 w-5 h-5 rounded text-[10px] font-bold"
                        style={{
                          background: s.priority === "high" ? "var(--color-error)20" : s.priority === "medium" ? "var(--color-warning)20" : "var(--color-success)20",
                          color: s.priority === "high" ? "var(--color-error)" : s.priority === "medium" ? "var(--color-warning)" : "var(--color-success)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm leading-relaxed" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                        {s.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Quick links CTA */}
            <div className="dashboard-surface flex items-center gap-4 px-4 py-3">
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                快速查看:
              </span>
              <Link
                href="/trends"
                className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
              >
                <TrendingUp className="w-3 h-3" /> 趋势分析
              </Link>
              <Link
                href="/compare"
                className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
              >
                <BarChart3 className="w-3 h-3" /> 竞品对比
              </Link>
              <Link
                href="/suggestions"
                className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
              >
                <Lightbulb className="w-3 h-3" /> 全部建议
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VisibilityPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="dashboard-surface dashboard-surface--padded h-10 w-48 animate-skeleton-pulse" />
          <div className="grid grid-cols-5 gap-4">
            <div className="dashboard-surface dashboard-surface--padded col-span-2 h-48 animate-skeleton-pulse" />
            <div className="col-span-3 grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="dashboard-surface dashboard-surface--padded h-20 animate-skeleton-pulse" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <VisibilityContent />
    </Suspense>
  );
}
