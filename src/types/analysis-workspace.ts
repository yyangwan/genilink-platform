import type { CitationReport } from './citation-report';
import type { EvidenceRun } from './intelligence';
export type WorkspaceView = 'insights' | 'suggestions' | 'compare' | 'strategic';
export interface ObservationContext { platform: string; response_id: string; source_id: string | null; kind: string }
export interface AnalysisWorkspace {
  schema: 'citation-workspace-1'; project_id: string; enabled: boolean; processing: boolean;
  view?: WorkspaceView; selected_audit_id: string | null; latest_audit_id: string | null;
  audits: Array<{ id: string; status: string; created_at: string }>; audits_truncated: boolean;
  report: CitationReport | null; context_sync_pending?: boolean; can_act?: boolean; can_review?: boolean;
  observations: { mentions: Array<NonNullable<EvidenceRun['summary']['mentions']>[number] & { contexts: ObservationContext[] }>;
    claims: Array<NonNullable<EvidenceRun['summary']['claims']>[number] & { contexts: ObservationContext[] }>;
    prompt_platforms: NonNullable<EvidenceRun['summary']['prompt_platforms']> } | null;
}
