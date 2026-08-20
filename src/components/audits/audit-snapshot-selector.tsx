"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink, History } from "lucide-react";
import { formatDateInTimeZone } from "@/lib/time";
import type { SelectableAudit } from "@/lib/visibility/audit-selection";

interface AuditSnapshotSelectorProps {
  audits: SelectableAudit[];
  selectedAuditId: number | null;
  latestAuditId: number | null;
  projectId: string;
  loading?: boolean;
  onChange: (auditId: number) => void;
}
function auditLabel(audit: SelectableAudit, latestAuditId: number | null): string {
  const date = audit.completed_at ?? audit.created_at ?? audit.started_at;
  const dateLabel = date
    ? formatDateInTimeZone(date, { includeYear: true, includeTime: true })
    : "时间未知";
  return `${audit.id === latestAuditId ? "最新 · " : ""}${dateLabel} · 审计 #${audit.id}`;
}

export function AuditSnapshotSelector({
  audits,
  selectedAuditId,
  latestAuditId,
  projectId,
  loading = false,
  onChange,
}: AuditSnapshotSelectorProps) {
  if (!loading && audits.length === 0) return null;
  const isHistorical = selectedAuditId !== null && latestAuditId !== null && selectedAuditId !== latestAuditId;

  return (
    <div className="dashboard-surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 items-start gap-2">
        <History className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--color-primary)" }} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>审计数据快照</span>
            {isHistorical && (
              <span className="rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--color-warning)20", color: "var(--color-warning)" }}>
                历史审计
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            切换审计后，本页只展示该次审计生成的结果，不会被最新数据覆盖。
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="min-w-[260px]">
          <span className="mb-1 block text-[11px] font-medium tracking-wide" style={{ color: "var(--text-secondary)" }}>
            选择审计报告
          </span>
          <span className="group relative block">
            <select
              aria-label="选择审计报告"
              value={selectedAuditId ?? ""}
              disabled={loading || audits.length === 0}
              onChange={(event) => onChange(Number(event.target.value))}
              className="min-h-10 w-full cursor-pointer appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] py-2 pl-3 pr-10 text-sm text-[var(--text-primary)] outline-none transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-[var(--color-primary)] hover:bg-[var(--bg-hover)] hover:shadow-[0_0_0_3px_var(--color-primary-dim)] focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary-dim)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading && <option value="">正在加载审计记录...</option>}
              {audits.map((audit) => (
                <option key={audit.id} value={audit.id}>{auditLabel(audit, latestAuditId)}</option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)] transition-[color,transform] duration-200 group-hover:translate-y-[-40%] group-hover:text-[var(--color-primary)] group-focus-within:translate-y-[-40%] group-focus-within:text-[var(--color-primary)]"
            />
          </span>
        </label>
        {selectedAuditId !== null && (
          <Link
            href={`/audits/${selectedAuditId}/report?project=${encodeURIComponent(projectId)}`}
            className="dashboard-button dashboard-button--secondary"
          >
            查看完整报告
            <ExternalLink size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}
