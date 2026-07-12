"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { Suspense, useState, useEffect, useCallback } from "react";
import { Clock, Plus, Trash2, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useProject } from "@/components/project/project-context";
import {
  DiagnosticChecklist,
  type DiagnosticItem,
} from "@/components/ui/diagnostic-checklist";
import type { Schedule } from "@/types/visibility";
import { formatDateInTimeZone } from "@/lib/time";

interface SchedulesResponse {
  schedules: Schedule[];
}

const PRESET_CRONS = [
  { label: "每天", cron: "0 9 * * *" },
  { label: "每周", cron: "0 9 * * 1" },
  { label: "每月", cron: "0 9 1 * *" },
];

function SchedulesContent() {
  const { currentProjectId, currentProject, loading, openWizard, projects } = useProject();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [schedulesError, setSchedulesError] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCron, setNewCron] = useState("0 9 * * *");
  const [creating, setCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Schedule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchSchedules = useCallback(() => {
    if (!currentProjectId) return;
    setSchedulesLoading(true);
    setSchedulesError(false);
    fetch(`/api/integration/schedules?projectId=${currentProjectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        if (data?.schedules) {
          setSchedules(data.schedules);
        } else if (Array.isArray(data)) {
          setSchedules(data);
        }
      })
      .catch(() => setSchedulesError(true))
      .finally(() => setSchedulesLoading(false));
  }, [currentProjectId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const handleCreate = useCallback(async () => {
    if (!currentProjectId || !newCron) return;
    setCreating(true);
    try {
      const res = await fetch("/api/integration/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cron_expression: newCron, projectId: currentProjectId }),
      });
      if (res.ok) {
        setShowCreateForm(false);
        setNewCron("0 9 * * *");
        fetchSchedules();
      }
    } catch {
      // Silently fail
    } finally {
      setCreating(false);
    }
  }, [currentProjectId, newCron, fetchSchedules]);

  const handleToggle = useCallback(async (schedule: Schedule) => {
    setTogglingId(schedule.id);
    try {
      const res = await fetch(`/api/integration/schedules/${schedule.id}?projectId=${currentProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !schedule.is_active }),
      });
      if (res.ok) {
        fetchSchedules();
      }
    } catch {
      // Silently fail
    } finally {
      setTogglingId(null);
    }
  }, [fetchSchedules]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/integration/schedules/${deleteTarget.id}?projectId=${currentProjectId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchSchedules();
      }
    } catch {
      // Silently fail
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, fetchSchedules]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "--";
    return formatDateInTimeZone(dateStr, { includeYear: false });
  };

  const columns = [
    {
      key: "cron_expression",
      header: "Cron 表达式",
      width: "180px",
      render: (row: Schedule) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{row.cron_expression}</span>
      ),
    },
    {
      key: "is_active",
      header: "状态",
      width: "100px",
      render: (row: Schedule) => (
        <span
          className={`dashboard-chip ${row.is_active ? "dashboard-chip--success" : ""}`}
          style={{ background: row.is_active ? "color-mix(in srgb, var(--color-success) 14%, transparent)" : "var(--bg-hover)", color: row.is_active ? "var(--color-success)" : "var(--text-muted)" }}
        >
          {row.is_active ? "运行中" : "已暂停"}
        </span>
      ),
    },
    {
      key: "last_run_at",
      header: "上次运行",
      render: (row: Schedule) => (
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          {formatDate(row.last_run_at)}
        </span>
      ),
    },
    {
      key: "next_run_at",
      header: "下次运行",
      render: (row: Schedule) => (
        <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
          {formatDate(row.next_run_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "操作",
      width: "160px",
      render: (row: Schedule) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleToggle(row); }}
            disabled={togglingId === row.id}
            className="dashboard-button"
            style={{ minHeight: 28, padding: "4px 10px", background: row.is_active ? "color-mix(in srgb, var(--color-warning) 14%, transparent)" : "color-mix(in srgb, var(--color-success) 14%, transparent)", color: row.is_active ? "var(--color-warning)" : "var(--color-success)", cursor: togglingId === row.id ? "not-allowed" : "pointer" }}
          >
            {togglingId === row.id ? (
              <Loader2 className="w-3 h-3 animate-spin inline" />
            ) : row.is_active ? "暂停" : "启用"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
            className="dashboard-button"
            style={{ minHeight: 28, padding: "4px 10px", background: "color-mix(in srgb, var(--color-error) 14%, transparent)", color: "var(--color-error)", cursor: "pointer" }}
          >
            <Trash2 className="w-3 h-3 inline" />
          </button>
        </div>
      ),
    },
  ];

  const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    outline: "none",
    width: "100%",
  };

  // No project selected state — show DiagnosticChecklist
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
        <PageHeader title="定时任务" subtitle="管理自动化可见性分析计划" />
        <DiagnosticChecklist items={diagnosticItems} title="准备工作" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="定时任务"
        subtitle="管理自动化可见性分析计划"
        actions={
          <button
            onClick={() => setShowCreateForm(true)}
            className="dashboard-button dashboard-button--primary"
          >
            <Plus className="w-3.5 h-3.5" />
            创建定时任务
          </button>
        }
      />

      {/* Create form */}
      {showCreateForm && (
        <div className="dashboard-surface dashboard-surface--padded">
          <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
            新建定时任务
          </h3>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              {PRESET_CRONS.map((preset) => (
                <button
                  key={preset.cron}
                  onClick={() => setNewCron(preset.cron)}
                  className={`dashboard-chip ${newCron === preset.cron ? "dashboard-chip--success" : ""}`}
                  style={{ background: newCron === preset.cron ? "var(--color-primary)" : "var(--bg-card)", color: newCron === preset.cron ? "#0b0d14" : "var(--text-secondary)", border: newCron === preset.cron ? "none" : "1px solid var(--border)", cursor: "pointer" }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={newCron}
              onChange={(e) => setNewCron(e.target.value)}
              placeholder="Cron 表达式"
              className="dashboard-input px-3 py-2 text-sm"
              style={inputStyle}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="dashboard-button dashboard-button--primary"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                创建
              </button>
              <button
                onClick={() => { setShowCreateForm(false); setNewCron("0 9 * * *"); }}
                className="dashboard-button dashboard-button--secondary"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {schedulesError ? (
        <div className="dashboard-surface">
          <ErrorState onRetry={fetchSchedules} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={schedules}
          rowKey={(row) => row.id}
          loading={schedulesLoading}
          emptyContent={
            <EmptyState
              icon={Clock}
              title="暂无定时任务"
              description="创建定时任务以自动化可见性分析"
              actionLabel="创建定时任务"
              onAction={() => setShowCreateForm(true)}
            />
          }
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget != null}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        title="删除定时任务"
        message={`确定要删除 Cron 表达式「${deleteTarget?.cron_expression}」的定时任务吗？`}
        confirmLabel={deleting ? "删除中..." : "删除"}
        cancelLabel="取消"
      />
    </div>
  );
}

export default function SchedulesPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-20 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
          <div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        </div>
      }
    >
      <SchedulesContent />
    </Suspense>
  );
}
