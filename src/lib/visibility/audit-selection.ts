import { getAuditStatus, isAuditFinished } from "@/lib/audit-status";

export interface SelectableAudit {
  id: number;
  status?: string | null;
  phase?: string | null;
  started_at?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}
type AuditPayload = SelectableAudit[] | { audits?: SelectableAudit[] } | null;

function auditDateValue(audit: SelectableAudit): number {
  const raw = audit.completed_at ?? audit.created_at ?? audit.started_at;
  const timestamp = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isNaN(timestamp) ? audit.id : timestamp;
}

export function getCompletedAudits(payload: AuditPayload): SelectableAudit[] {
  const audits = Array.isArray(payload) ? payload : payload?.audits ?? [];
  return audits
    .filter((audit) => isAuditFinished(getAuditStatus(audit)))
    .slice()
    .sort((a, b) => auditDateValue(b) - auditDateValue(a));
}

export function resolveSelectedAuditId(audits: SelectableAudit[], requestedId: string | null): number | null {
  const parsedId = requestedId ? Number(requestedId) : Number.NaN;
  if (Number.isInteger(parsedId) && audits.some((audit) => audit.id === parsedId)) {
    return parsedId;
  }
  return audits[0]?.id ?? null;
}
