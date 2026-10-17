import type { PresenceMetric } from '@/components/visibility/presence-metrics';

export interface MeasurementHistory {
  schema: 'citation-measurement-history-1'; project_id: string; enabled: boolean;
  selected_cohort_id: string | null; cohorts_truncated: boolean; results_truncated: boolean;
  history_days?: number; context_sync_pending?: boolean;
  cohorts: Array<{ id: string; title: string; baseline_run_id: string; created_at: string; expected_samples: number; platforms: string[] }>;
  results: Array<{ id: string; cohort_id: string; version: string; created_at: string; snapshot_current: boolean; cohort_title?: string; report_role?: 'baseline' | 'followup';
    baseline_run_id: string; followup_run_id: string; baseline_audit_id: string; followup_audit_id: string;
    entities: Array<{ id: string; name: string; identity_status: string }>;
    platforms: Array<{ platform: string; status: string; expected_samples: number; prompt_clusters: number;
      included: unknown[]; excluded: Array<{ baseline_sample_id: string; sample_index: number; reason: string }>;
      out_of_cohort: unknown[]; source_populations?: Record<string, Partial<PresenceMetric>>; metrics: PresenceMetric[] }> }>;
}
