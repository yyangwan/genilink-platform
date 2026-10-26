import type { ObservationCohort, ObservationResult, PublicationOptions, Publication, Retest } from '@/lib/visibility/observation-contract';
import { taskPack, project, actionId, runId, run as baseRun } from './task-workspace';
import type { EvidenceRun } from '@/types/intelligence';
export { project, actionId, runId };
export const cohortId = '3'.repeat(32), retestId = '4'.repeat(32), followupId = '5'.repeat(32);
export const options = (): PublicationOptions => ({ action_id: actionId, revision: 3, revision_id: '1'.repeat(32), action_title: taskPack().deliverable,
  can_write: true, is_current: true, can_register: true, task_pack: taskPack(), execution_status: 'accepted',
  deliveries: [{ delivery_event_id: '2'.repeat(32), artifact_index: 0, title: '官网实施说明 v2', kind: 'external_url', submitted_at: '2026-10-24T08:00:00Z', verification: 'manual_registration', version_fingerprint: 'a'.repeat(64), acceptance_state: 'accepted' }] });
export const publication = (): Publication => ({ id: '6'.repeat(32), action_id: actionId, url: 'https://example.com/implementation', channel: 'website',
  published_at: '2026-10-24T10:00:00Z', reason: '人工核对官网实际发布的版本与时间', verification: 'human_attested_delivery_version', published_bytes_verified: false,
  provenance: { revision: 3, revision_id: '1'.repeat(32), action_title: taskPack().deliverable, artifact: { title: '官网实施说明 v2' } } });
export const run = { ...baseRun, audit_id: '1', revision: 2, responses: taskPack().ai_targets.map((target, index) => ({ id: String(index + 7).repeat(32), platform: target.platform, prompt_hash: target.prompt_hash })) } as EvidenceRun;
export const cohort = (): ObservationCohort => ({ id: cohortId, title: '实施说明发布后的单次观察', baseline_run_id: runId, comparison_mode: 'descriptive_v1', created_at: '2026-10-26T00:00:00Z',
  expected_samples: 2, platforms: ['qwen', 'doubao'], brand_targets: baseRun.summary.brand_presence!.targets.slice(0, 2),
  action_link: { policy_version: 'publication-window-v1', action_id: actionId, revision: 3, revision_id: '1'.repeat(32), action_title: taskPack().deliverable, publications: [publication()] },
  questions: taskPack().ai_targets.map(row => ({ platform: row.platform, prompt_hash: row.prompt_hash, text: taskPack().delivery.questions[0].text })) });
export const retest = (): Retest => ({ id: retestId, cohort_id: cohortId, audit_id: '2', capture_status: 'partial', sample_scope_valid: true, expected_samples: 2,
  complete_samples: 1, pending_samples: 0, missing_samples: 1, published_run_id: followupId, analysis_pending: false, retry_stamp: 'a'.repeat(64), can_retry: true, retry_limit_reached: false,
  platforms: [{ platform: 'qwen', expected: 1, complete: 1, pending: 0, missing: 0 }, { platform: 'doubao', expected: 1, complete: 0, pending: 0, missing: 1 }] });
export const result = (): ObservationResult => ({ id: '7'.repeat(32), cohort_id: cohortId, comparison_mode: 'descriptive_v1', version: 'brand-observation-descriptive-1',
  baseline_run_id: runId, followup_run_id: followupId, created_at: '2026-10-26T02:00:00Z', snapshot_current: true, brand_targets: cohort().brand_targets, action_link: cohort().action_link!,
  platforms: ['qwen', 'doubao'].map(platform => ({ platform, observations: [{ prompt_hash: taskPack().delivery.questions[0].prompt_hash, baseline_sample_id: platform,
    baseline_response_id: 'b'.repeat(32), followup_response_id: platform === 'qwen' ? 'c'.repeat(32) : null,
    baseline_observed_at: '2026-10-20T02:00:00Z', followup_observed_at: platform === 'qwen' ? '2026-10-26T02:00:00Z' : null,
    comparison_state: platform === 'qwen' ? 'comparable' : 'missing', reason_codes: platform === 'qwen' ? [] : ['sample_missing'], publication_window: { status: platform === 'qwen' ? 'time_ordered' : 'not_qualified' },
    targets: cohort().brand_targets.map((target, index) => ({ brand_target_id: target.target_id, metrics: ['presence', 'recommendation', 'position', 'reasons', 'cited_card_presence', 'cited_archive_presence', 'candidate_card_presence'].map(metric => ({
      metric, unit: metric === 'presence' || metric.includes('presence') ? 'presence_0_1' : 'score_points_0_100',
      baseline: { known: true, value: metric === 'presence' || metric.includes('presence') ? index : 20, evidence_ids: ['proof'], source_traces: [], reason_codes: [] },
      followup: { known: platform === 'qwen', value: platform === 'qwen' ? metric === 'presence' || metric.includes('presence') ? 1 : 35 : null, evidence_ids: [], source_traces: [], reason_codes: [] },
      comparison_state: platform === 'qwen' ? 'comparable' : 'missing', reason_codes: platform === 'qwen' ? [] : ['sample_missing'], observed_delta: platform === 'qwen' ? metric === 'presence' || metric.includes('presence') ? 1 - index : 15 : null,
    })) })),
  }] })),
});
