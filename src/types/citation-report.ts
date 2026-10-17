import type { EvidenceRun } from './intelligence';
import type { MeasurementHistory } from './measurement-history';

export interface CitationReport {
  schema: 'citation-report-1'; audit_id: string; project_id: string; status: string;
  run_id?: string; revision?: number; finished_at?: string; snapshot_current: boolean;
  context_sync_pending?: boolean; entitlementLevel?: string;
  coverage?: EvidenceRun['coverage']; entities?: NonNullable<EvidenceRun['summary']['entities']>;
  platforms?: Array<{ platform: string; samples: number; metrics: Array<{ metric: string;
    included: string[]; excluded: Array<{ response_id: string; reason: string }>;
    entities: Array<{ entity_id: string; numerator: number; denominator: number }> }> }>;
  diagnoses?: EvidenceRun['summary']['diagnoses'];
  evidence?: Array<NonNullable<EvidenceRun['summary']['claim_evidence']>[number] & {
    human_review: { relation: string; source_quote: string; reason: string; actor_id: string; version: number } | null }>;
  sources?: Array<Pick<EvidenceRun['sources'][number], 'id' | 'response_id' | 'platform' | 'title' | 'kind' | 'snippet' | 'snapshot_id' | 'fetch_status'>>;
  responses?: Array<{ id: string; platform: string; prompt: string; observed_at: string; answer_status: string }>;
  source_states?: Record<string, number>;
  measurements?: { scope_run_id: string; results: MeasurementHistory['results']; truncated: boolean };
}
