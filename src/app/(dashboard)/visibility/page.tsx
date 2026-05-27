"use client";

import React, { Suspense, useState, useCallback, useRef } from "react";
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
import type { VisibilitySummary } from "@/types";
import { sectionCard } from "@/components/charts/shared";

type AnalysisPhase = "idle" | "creating" | "collecting" | "analyzing" | "done" | "error";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Extract polling logic so it can be reused for resume
  const startPolling = useCallback((auditId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/integration/audits/${auditId}`);
        if (!statusRes.ok) return;
        const status = await statusRes.json();
        const phase = status.phase || status.status;

        if (phase === "collecting" || phase === "pending") {
          setAnalysisPhase("collecting");
        } else if (phase === "analyzing" || phase === "running") {
          setAnalysisPhase("analyzing");
        } else if (phase === "completed" || phase === "done" || phase === "partial") {
          if (pollRef.current) clearInterval(pollRef.current);
          setAnalysisPhase("done");
          visibility.refetch();
          // Chain: generate report → generate suggestions
          if (currentProjectId) {
            fetch(`/api/integration/audits/${auditId}/report`, { method: "POST" })
              .then((r) => r.ok ? fetch("/api/integration/suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: currentProjectId }),
              }) : Promise.reject())
              .catch(() => { /* non-critical */ });
          }
        } else if (phase === "failed" || phase === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          setAnalysisPhase("error");
          setAnalysisError(status.error_message || "分析失败");
        }
      } catch {
        // Poll errors are transient, keep trying
      }
    }, 3000);
  }, [visibility]);

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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
        startPolling(auditId);
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

    try {
      const [promptsRes, brandsRes] = await Promise.all([
        fetch(`/api/integration/prompts?projectId=${currentProjectId}`),
        fetch(`/api/integration/brands?projectId=${currentProjectId}`),
      ]);

      const promptsData = promptsRes.ok ? await promptsRes.json() : [];
      const brandsData = brandsRes.ok ? await brandsRes.json() : [];

      const hasPrompts = Array.isArray(promptsData) && promptsData.length > 0;
      const hasBrands = Array.isArray(brandsData) && brandsData.length > 0;

      if (!hasBrands) {
        setAnalysisPhase("error");
        setAnalysisError("NO_BRANDS");
        return;
      }

      if (!hasPrompts) {
        setAnalysisPhase("creating");
        const genRes = await fetch("/api/integration/prompts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId }),
        });
        if (!genRes.ok) {
          const err = await genRes.json().catch(() => ({}));
          setAnalysisPhase("error");
          setAnalysisError(err.error || "NO_PROMPTS");
          return;
        }
      }

      setAnalysisPhase("creating");
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
      startPolling(auditId);
    } catch (err) {
      setAnalysisPhase("error");
      setAnalysisError((err as Error).message);
    }
  }, [currentProjectId, startPolling]);

  const phaseText: Record<AnalysisPhase, string> = {
    idle: "",
    creating: "正在创建审计...",
    collecting: "数据采集中...",
    analyzing: "AI 分析中...",
    done: "分析完成",
    error: analysisError === "NO_BRANDS"
      ? "请先在设置中添加品牌"
      : analysisError === "NO_PROMPTS"
      ? "提示词生成失败，请在设置中手动添加"
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
      {/* Header */}
      <div className="flex items-center justify-between">
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
            {currentProject && (
              <span style={{ color: "var(--text-muted)" }}> · {currentProject.name}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentProjectId && analysisPhase === "idle" && (
            <button
              onClick={handleStartAnalysis}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--color-primary)",
                color: "#0b0d14",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-body)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--color-primary-hover)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--color-primary)")
              }
            >
              <Play className="w-3.5 h-3.5" />
              开始 AI 分析
            </button>
          )}

          {isAnalyzing && (
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
              style={{
                background: "var(--color-primary-dim)",
                color: "var(--color-primary)",
                fontFamily: "var(--font-body)",
              }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {phaseText[analysisPhase]}
            </div>
          )}

          {analysisPhase === "done" && (
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
              style={{
                background: "var(--color-success)20",
                color: "var(--color-success)",
                fontFamily: "var(--font-body)",
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              分析完成
            </div>
          )}

          {analysisPhase === "error" && (
            analysisError === "NO_BRANDS" ? (
              <Link
                href="/settings/brands"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--color-error)20",
                  color: "var(--color-error)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                  textDecoration: "none",
                }}
              >
                <Settings className="w-3.5 h-3.5" />
                请先添加品牌
              </Link>
            ) : (
              <button
                onClick={handleStartAnalysis}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "var(--color-error)20",
                  color: "var(--color-error)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "var(--font-body)",
                }}
              >
                重试分析
              </button>
            )
          )}

          <button
            onClick={visibility.refetch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
            }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${visibility.loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </div>

      {/* Progress bar during analysis */}
      {isAnalyzing && (
        <div
          className="h-1 rounded-full overflow-hidden"
          style={{ background: "var(--bg-hover)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: analysisPhase === "creating" ? "10%" : analysisPhase === "collecting" ? "40%" : "70%",
              background: "var(--color-primary)",
            }}
          />
        </div>
      )}

      {/* Two-column hero layout */}
      {!hasData && !isAnalyzing ? (
        /* Empty state — no data yet */
        <div style={sectionCard}>
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
              style={{
                ...sectionCard,
                borderLeft: `4px solid ${scoreColor(visibility.data?.overallScore)}`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 180,
                textAlign: "center",
              }}
            >
              {visibility.loading ? (
                <div className="h-16 w-24 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
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
            <div style={sectionCard}>
              <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
                AI平台覆盖
              </h3>
              {visibility.loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-5 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
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
              <div style={sectionCard}>
                <div className="flex items-center gap-2 mb-1">
                  <Eye className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    品牌提及
                  </span>
                </div>
                {visibility.loading ? (
                  <div className="h-7 w-14 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
                ) : (
                  <span className="text-xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {visibility.data?.mentionCount ?? "--"}
                  </span>
                )}
              </div>
              <div style={sectionCard}>
                <div className="flex items-center gap-2 mb-1">
                  <Trophy className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    竞品排名
                  </span>
                </div>
                {visibility.loading ? (
                  <div className="h-7 w-14 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
                ) : (
                  <span className="text-xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {visibility.data?.competitorRank ? `#${visibility.data.competitorRank}` : "--"}
                  </span>
                )}
              </div>
              <div style={sectionCard}>
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    最近审计
                  </span>
                </div>
                {visibility.loading ? (
                  <div className="h-7 w-14 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
                ) : (
                  <span className="text-base font-semibold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                    {visibility.data?.latestAuditDate
                      ? new Date(visibility.data.latestAuditDate).toLocaleDateString("zh-CN", { month: "short", day: "numeric" })
                      : "--"}
                  </span>
                )}
              </div>
              <div style={sectionCard}>
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-3.5 h-3.5" style={{ color: "var(--color-primary)" }} />
                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    可见性得分
                  </span>
                </div>
                {visibility.loading ? (
                  <div className="h-7 w-14 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
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
            <div
              className="flex items-center gap-4 px-4 py-3 rounded-xl"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
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
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-2 h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            <div className="col-span-3 grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
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
