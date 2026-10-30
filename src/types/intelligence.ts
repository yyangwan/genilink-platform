export interface ScenarioComparison {
  version: string; taxonomy: Record<string, string>; total_questions: number; reviewed_questions: number;
  questions: Array<{ prompt_hash: string; primary_scenario: string | null }>;
  scope_scores: Array<{ target_id: string; scenario: string; platform: string; sample_count: number; sample_ids: string[];
    total: BrandScoreAggregate; dimensions: Record<BrandScoreDimension, BrandScoreAggregate> }>;
}
export type BrandScoreDimension = 'presence' | 'recommendation' | 'position' | 'reasons';
export interface BrandPresence {
  version: 'brand-presence-v1'; mapping_hash: string;
  targets: Array<{ target_id: string; registry_brand_id: string | null; entity_id: string | null;
    name: string; names: string[]; role: string; identity_status: string; reason_codes: string[];
    candidate_entity_ids?: string[]; presence_counts: Partial<Record<'present' | 'observed_absent' | 'unknown', number>>;
    source_mentions: number }>;
  observations: Array<{ target_id: string; entity_id: string | null; sample_id: string;
    response_id: string | null; platform: string; state: 'present' | 'observed_absent' | 'unknown';
    reason_codes: string[]; evidence_ids: string[]; coverage_complete: boolean;
    score: number | null; dimensions: Record<BrandScoreDimension, number | null> }>;
  scope_scores: Array<{ target_id: string; platform: string; total: BrandScoreAggregate;
    dimensions: Record<BrandScoreDimension, BrandScoreAggregate> }>;
}
export interface ResultReadiness {
  version: 'result-readiness-v1';
  items: Array<{ key: string; title: string; state: 'ready' | 'partial' | 'pending' | 'blocked' | 'not_applicable';
    completed: number; total: number | null; reason_codes: string[]; detail: string;
    remedy: { view: string; action: string; label: string } }>;
}
export interface BrandScoreAggregate {
  rule_version: string; cohort_hash: string; score: number | null;
  covered_weight: number; missing_sample_ids: string[]; status: 'complete' | 'pending';
}
export interface CompetitiveComparison {
  version: 'competitive-comparison-v1'; minimum_gap_points: number; candidate_gap_count: number;
  interpretation: 'single_audit_observation'; ordering_basis: 'observed_gap_not_business_priority'; threshold_note: string;
  scope_scores: Array<{ entity_id: string; axis: 'overall' | 'platform' | 'category' | 'platform_category';
    scope: string | [string, string]; sample_count: number; total: BrandScoreAggregate;
    dimensions: Record<BrandScoreDimension, BrandScoreAggregate> }>;
  gaps: Array<{ id: string; own_entity_id: string; comparison_entity_id: string; platform: string; category: string;
    dimension: BrandScoreDimension; own_score: number; comparison_score: number; gap_points: number;
    cohort_hash: string; sample_count: number; supporting_sample_ids: string[]; prompts: string[];
    response_ids: string[]; evidence_ids: string[]; finding: string; cause_status: 'not_established'; review_state: 'needs_review';
    action: { status: 'proposed'; title: string; task: string; target_prompts: string[]; owner_role: string;
      materials_needed: string[]; acceptance: string;
      retest: { platform: string; prompt_hashes: string[]; dimension: BrandScoreDimension; success_check: string } } }>;
}

export interface EvidenceRunListItem {
  id: string; audit_id: string; revision: number; status: string; created_at: string;
  coverage: { total_segments?: number; segment_states?: Record<string, number>; total_characters?: number;
    analyzed_characters?: number; responses?: number; failed_responses?: number; sources?: number;
    captured_sources?: number; complete?: boolean; semantic_error_count?: number;
    evidence_alignment?: import('@/lib/visibility/source-observation').EvidenceAlignment };
}
export interface EvidenceRun extends EvidenceRunListItem {
  readiness?: ResultReadiness;
  identity_reviews?: Record<string, { event_id: string; version: number; decision: string; canonical_name: string; reason: string }>;
  claim_reviews?: Record<string, { id: string; version: number; relation: string; source_quote: string; reason: string }>;
  sources: Array<{ id: string; response_id: string; platform: string; title: string; url: string | null;
    kind: string; snippet: string; document_id: string | null; snapshot_id: string | null; fetch_status: string }>;
  responses: Array<{ id: string; platform: string; prompt: string; prompt_hash: string; observed_at: string; error: boolean }>;
  summary: {
    scenario_comparison?: ScenarioComparison;
    brand_presence?: BrandPresence;
    brand_evaluation?: {
      comparison: CompetitiveComparison;
      version: 'brand-visibility-v1';
      weights: { presence: number; recommendation: number; position: number; reasons: number };
      cohort_hash: string | null;
      status: 'requires_prompt_review' | 'missing_planned_cohort' | 'no_competitive_prompts' | 'complete' | 'partial';
      score: null;
      brand_scores: Array<{ entity_id: string; rule_version: string; cohort_hash: string;
        score: number | null; covered_weight: number; missing_sample_ids: string[]; status: 'complete' | 'pending' }>;
      answer_scores: Array<{
        entity_id: string; response_id: string; sample_id: string | null; platform: string;
        score: number | null; status: 'pending' | 'partial' | 'complete';
        dimensions: { presence: number | null; recommendation: number | null; position: number | null; reasons: number | null };
        conflicting_fields: string[]; evidence_ids: string[];
        position_status: 'whole_answer_list_not_verified' | 'verified_explicit_list'; interpretation: 'model_extracted_unreviewed';
        position_evidence: { rank: number; list_size: number; start: number; end: number; quote: string } | null;
      }>;
    };
    brand_signals?: {
      version: 'brand-signals-v1';
      status: 'extracted' | 'partial' | 'pending';
      answer_segments: number; extracted_segments: number; rejected_spans: number;
      score_status: 'awaiting_evaluation_cohort';
      observations: Array<{
        id: string; response_id: string; segment_id: string; platform: string; prompt_hash: string;
        observed_name: string; entity_id: string | null; mention_ids: string[];
        quote: string; start: number; end: number;
        recommendation: 0 | 1 | 2 | 3 | 4 | null; explicit_rank: number | null;
        reason_level: 'none' | 'generic' | 'specific' | 'need_matched' | null;
        analysis_status: string; review_state: 'unreviewed'; scope: 'segment';
      }>;
    };
    claim_evidence?: Array<{ id: string; answer_quote: string; source_quote: string; relation: string; review_state: string;
      snapshot_id: string; source_title: string; source_url: string | null; platform: string;
      citation_id?: string; response_id?: string; claim_hash?: string; method?: string; source_segment_id?: string; answer_segment_id?: string;
      verification?: import('@/lib/visibility/source-observation').SourceVerification;
      content_family_id?: string | null; conflicting_interpretations?: boolean; content_family_relations?: string[] }>;
    prompt_platforms?: Array<{ prompt_hash: string; prompt: string; platform: string; sample_count: number; comparable: boolean }>;
    entities?: Array<{ id: string; name: string; kind: string; role: string; identity_status: string; observed_entities?: Array<{ id: string; name: string }>; observed_names?: string[]; role_conflict?: boolean;
      response_count: number; source_mentions: number; platform_response_counts: Record<string, number> }>;
    platforms?: Array<{ platform: string; responses: number; analyzed_responses: number; source_observations: number; snapshot_count: number }>;
    mentions?: Array<{ id: string; entity_id?: string; identity_ambiguity?: boolean; binding_key?: string; observed_entity_name?: string; attribution?: { decision: string; version: number; target_entity_id: string | null; reason: string } | null; entity_name: string; owner_kind: string; owner_id: string; quote: string; sentiment: string }>;
    claims?: Array<{ segment_id: string; owner_kind: string; owner_id: string; quote: string; subject: string; topic: string; evidence_relation: string }>;
      diagnoses?: Array<{ id?: string; record_id?: string; platform: string; prompt?: string; finding: string; sample_count?: number; response_ids?: string[]; evidence_ids?: string[];
        action?: { status: string; task: string; materials_needed: string[]; success_check: string } }>;
  };
}
