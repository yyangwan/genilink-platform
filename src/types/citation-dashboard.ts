import type { CitationReport } from './citation-report';
export interface CitationDashboard {
  schema: 'citation-dashboard-1'; project_id: string; enabled: boolean; processing: boolean;
  latest_audit: { id: string; status: string; stage: string; created_at: string; platforms: string[] } | null;
  report: CitationReport | null;
  context_sync_pending?: boolean; can_capture?: boolean; waiting?: boolean;
}
