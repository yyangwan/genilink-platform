"use client";

import React, { Suspense, useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import type { VisibilitySummary } from "@/types";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

type AnalysisPhase = "idle" | "creating" | "collecting" | "analyzing" | "done" | "error";

interface Project {
  id: string;
  name: string;
  url: string | null;
}

function VisibilityContent() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);

  // Determine current project
  const projectIdParam = searchParams.get("project");
  const currentProject = projectIdParam
    ? projects.find((p) => p.id === projectIdParam)
    : projects[0];
  const currentProjectId = currentProject?.id;

  // Fetch visibility data for current project
  const visibilityUrl = currentProjectId
    ? `/api/dashboard/visibility?project=${currentProjectId}`
    : "/api/dashboard/visibility";
  const visibility = useSectionFetch<VisibilitySummary>(visibilityUrl);

  // Analysis state
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>("idle");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch projects on mount
  useEffect(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.projects) {
          setProjects(data.projects);
        }
      })
      .catch(() => {})
      .finally(() => setProjectsLoading(false));
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleStartAnalysis = useCallback(async () => {
    if (!currentProjectId) return;

    setAnalysisPhase("creating");
    setAnalysisError(null);

    try {
      // Step 1: Create audit
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

      // Step 2: Trigger analysis
      setAnalysisPhase("collecting");
      const analyzeRes = await fetch(`/api/integration/audits/${auditId}/analyze`, {
        method: "POST",
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "触发分析失败");
      }

      // Step 3: Poll for completion
      setAnalysisPhase("analyzing");
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
          } else if (phase === "completed" || phase === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            setAnalysisPhase("done");
            visibility.refetch();
          } else if (phase === "failed" || phase === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            setAnalysisPhase("error");
            setAnalysisError(status.error_message || "分析失败");
          }
        } catch {
          // Poll errors are transient, keep trying
        }
      }, 3000);
    } catch (err) {
      setAnalysisPhase("error");
      setAnalysisError((err as Error).message);
    }
  }, [currentProjectId, visibility]);

  // Status text for each phase
  const phaseText: Record<AnalysisPhase, string> = {
    idle: "",
    creating: "正在创建审计...",
    collecting: "数据采集中...",
    analyzing: "AI 分析中...",
    done: "分析完成",
    error: analysisError || "分析失败",
  };

  const isAnalyzing = analysisPhase === "creating" || analysisPhase === "collecting" || analysisPhase === "analyzing";

  // No projects state
  if (!projectsLoading && projects.length === 0) {
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
        <div style={sectionCard}>
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-10 h-10 mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm mb-3" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              暂无项目 — 请先创建项目
            </p>
            <Link
              href="/projects"
              className="flex items-center gap-1.5 text-sm font-medium"
              style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
            >
              创建项目
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
          {/* Start AI Analysis button */}
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

          {/* Analysis in progress indicator */}
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

          {/* Analysis complete */}
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

          {/* Analysis error */}
          {analysisPhase === "error" && (
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
          )}

          {/* Refresh button */}
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

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <Eye className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              品牌提及
            </span>
          </div>
          {visibility.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {visibility.data?.mentionCount ?? "--"}
            </span>
          )}
        </div>
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              AI可见性得分
            </span>
          </div>
          {visibility.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span
              className="text-2xl font-bold"
              style={{
                color: visibility.data?.overallScore != null && visibility.data.overallScore >= 60
                  ? "var(--color-success)"
                  : "var(--text-primary)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {visibility.data?.overallScore ?? "--"}
            </span>
          )}
        </div>
        <div style={sectionCard}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4" style={{ color: "var(--color-primary)" }} />
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              竞品排名
            </span>
          </div>
          {visibility.loading ? (
            <div className="h-8 w-16 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          ) : (
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
              {visibility.data?.competitorRank ? `#${visibility.data.competitorRank}` : "--"}
            </span>
          )}
        </div>
      </div>

      {/* Platform coverage or empty state */}
      <div style={sectionCard}>
        {visibility.loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-6 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ))}
          </div>
        ) : visibility.data?.platformCoverage && visibility.data.platformCoverage.length > 0 ? (
          <div>
            <h3 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
              AI平台覆盖
            </h3>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={visibility.data.platformCoverage.map((p: { name: string; score: number }) => ({ name: p.name, score: p.score }))}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "var(--text-muted)", fontFamily: "var(--font-mono)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 12, fill: "var(--text-secondary)", fontFamily: "var(--font-body)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: 13,
                      fontFamily: "var(--font-body)",
                      color: "var(--text-primary)",
                    }}
                    formatter={(value) => [`${value}%`, "覆盖度"]}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={20}>
                    {visibility.data.platformCoverage.map((p: { name: string; score: number }, idx: number) => (
                      <Cell
                        key={idx}
                        fill={p.score >= 60 ? "var(--color-success)" : p.score >= 40 ? "var(--color-warning)" : "var(--color-error)"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
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
            {!currentProjectId && (
              <Link
                href="/projects"
                className="flex items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)", textDecoration: "none" }}
              >
                前往项目管理
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Suggestions */}
      {visibility.data?.suggestions && visibility.data.suggestions.length > 0 && (
        <div style={sectionCard}>
          <h3 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            AI优化建议
          </h3>
          <ul className="space-y-2">
            {visibility.data.suggestions.map((s: { priority: string; text: string }, i: number) => (
              <li
                key={i}
                className="flex items-start gap-3 py-2 px-3 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              >
                <span
                  className="inline-flex items-center justify-center shrink-0 w-6 h-5 rounded text-xs font-medium"
                  style={{
                    background: s.priority === "high" ? "var(--color-error)20" : s.priority === "medium" ? "var(--color-warning)20" : "var(--color-success)20",
                    color: s.priority === "high" ? "var(--color-error)" : s.priority === "medium" ? "var(--color-warning)" : "var(--color-success)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {s.priority === "high" ? "高" : s.priority === "medium" ? "中" : "低"}
                </span>
                <span className="text-sm pt-0.5" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                  {s.text}
                </span>
              </li>
            ))}
          </ul>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ))}
          </div>
        </div>
      }
    >
      <VisibilityContent />
    </Suspense>
  );
}
