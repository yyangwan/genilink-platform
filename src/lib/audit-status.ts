export type AuditStatusSource = {
  phase?: string | null;
  status?: string | null;
};

export function getAuditStatus(item: AuditStatusSource): string {
  return ((item.phase || item.status || "") as string).toLowerCase();
}

export function isAuditInProgress(status: string): boolean {
  return status === "pending" || status === "collecting" || status === "analyzing" || status === "running";
}

export function isAuditFinished(status: string): boolean {
  return status === "completed" || status === "done" || status === "partial";
}

