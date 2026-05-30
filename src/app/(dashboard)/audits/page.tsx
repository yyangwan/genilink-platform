"use client";

import React, { Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
} from "lucide-react";
import { useSectionFetch } from "@/components/dashboard/use-section-fetch";
import { useProject } from "@/components/project/project-context";
import { DataTable } from "@/components/ui/data-table";
import { DiagnosticChecklist, type DiagnosticItem } from "@/components/ui/diagnostic-checklist";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageHeader } from "@/components/ui/page-header";
import type { AuditListItem } from "@/types/visibility";
import { sectionCard } from "@/components/charts/shared";

const statusConfig: Record<string, { color: string; bg: string; label: string; Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }> = {
  completed: { color: "var(--color-success)", bg: "var(--color-success)20", label: "已完成", Icon: CheckCircle2 },
  failed: { color: "var(--color-error)", bg: "var(--color-error)20", label: "失败", Icon: XCircle },
  pending: { color: "var(--color-warning)", bg: "var(--color-warning)20", label: "等待中", Icon: Clock },
  collecting: { color: "var(--color-warning)", bg: "var(--color-warning)20", label: "采集中", Icon: Loader2 },
  analyzing: { color: "var(--color-warning)", bg: "var(--color-warning)20", label: "分析中", Icon: Loader2 },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-error)";
}

function AuditsContent() {
  const router = useRouter();
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();

  // Fetch audits for current project (null URL → skip fetch)
  const auditsUrl = currentProjectId
    ? `/api/integration/audits?projectId=${currentProjectId}`
    : null;
  const audits = useSectionFetch<AuditListItem[]>(auditsUrl);

  const columns = [
    {
      key: "id",
      header: "编号",
      width: "80px",
      render: (row: AuditListItem) => (
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
          #{row.id}
        </span>
      ),
    },
    {
      key: "status",
      header: "状态",
      width: "140px",
      render: (row: AuditListItem) => {
        const status = (row as unknown as Record<string, string>).phase || row.status;
        const cfg = statusConfig[status] ?? statusConfig.pending;
        const isSpinning = status === "collecting" || status === "analyzing";
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
            style={{
              background: cfg.bg,
              color: cfg.color,
              fontFamily: "var(--font-display)",
            }}
          >
            <cfg.Icon className={`w-3 h-3 ${isSpinning ? "animate-spin" : ""}`} />
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: "overall_score",
      header: "得分",
      width: "100px",
      render: (row: AuditListItem) => {
        if (row.overall_score == null) {
          return <span style={{ color: "var(--text-muted)" }}>--</span>;
        }
        return (
          <span
            className="font-semibold"
            style={{ color: scoreColor(row.overall_score), fontFamily: "var(--font-mono)" }}
          >
            {row.overall_score}
          </span>
        );
      },
    },
    {
      key: "started_at",
      header: "开始时间",
      width: "180px",
      render: (row: AuditListItem) => (
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          {formatDate(row.started_at)}
        </span>
      ),
    },
    {
      key: "completed_at",
      header: "完成时间",
      width: "180px",
      render: (row: AuditListItem) => (
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          {formatDate(row.completed_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      width: "120px",
      render: (row: AuditListItem) => {
        const status = (row as unknown as Record<string, string>).phase || row.status;
        if (status !== "completed" && status !== "done") return null;
        return (
          <span
            className="inline-flex items-center gap-1 text-xs font-medium"
            style={{ color: "var(--color-primary)", fontFamily: "var(--font-body)" }}
          >
            查看报告
            <ArrowRight className="w-3 h-3" />
          </span>
        );
      },
    },
  ];

  // No project selected — show diagnostic checklist
  if (!loading && !currentProjectId) {
    const checklistItems: DiagnosticItem[] = [
      { id: "project", label: "创建项目", status: projects.length === 0 ? "incomplete" : "complete", actionLabel: "创建", onAction: () => openWizard() },
      { id: "product", label: "完善产品信息", status: currentProject?.productName ? "complete" : "incomplete" },
    ];
    return (
      <div className="space-y-6">
        <PageHeader title="审计记录" subtitle="查看历史可见性分析记录" />
        <DiagnosticChecklist items={checklistItems} title="准备工作" />
      </div>
    );
  }

  const handleRowClick = (row: AuditListItem) => {
    const status = (row as unknown as Record<string, string>).phase || row.status;
    if (status === "completed" || status === "done") {
      router.push(`/audits/${row.id}/report`);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="审计记录"
        subtitle={
          currentProject
            ? `查看历史可见性分析记录 · ${currentProject.name}`
            : "查看历史可见性分析记录"
        }
      />

      {audits.error ? (
        <div style={sectionCard}>
          <ErrorState onRetry={audits.refetch} />
        </div>
      ) : (
        <DataTable<AuditListItem>
          columns={columns}
          data={audits.data ?? []}
          rowKey={(row) => row.id}
          onRowClick={handleRowClick}
          loading={audits.loading || loading}
          loadingRows={5}
          emptyContent={
            <EmptyState
              icon={FileText}
              title="还没有审计记录"
              description="完成第一次 AI 可见性分析后，审计记录将出现在这里"
              actionLabel="创建第一次审计"
              actionHref="/visibility"
            />
          }
        />
      )}
    </div>
  );
}

export default function AuditsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
            ))}
          </div>
        </div>
      }
    >
      <AuditsContent />
    </Suspense>
  );
}
