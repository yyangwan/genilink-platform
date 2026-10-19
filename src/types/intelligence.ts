export interface EvidenceRunListItem {
  id: string; audit_id: string; revision: number; status: string; created_at: string;
  coverage: { total_segments?: number; segment_states?: Record<string, number>; total_characters?: number;
    analyzed_characters?: number; responses?: number; failed_responses?: number; sources?: number;
    captured_sources?: number; complete?: boolean; semantic_error_count?: number };
}
export interface EvidenceRun extends EvidenceRunListItem {
  identity_reviews?: Record<string, { event_id: string; version: number; decision: string; canonical_name: string; reason: string }>;
  claim_reviews?: Record<string, { id: string; version: number; relation: string; source_quote: string; reason: string }>;
  sources: Array<{ id: string; response_id: string; platform: string; title: string; url: string | null;
    kind: string; snippet: string; document_id: string | null; snapshot_id: string | null; fetch_status: string }>;
  responses: Array<{ id: string; platform: string; prompt: string; prompt_hash: string; observed_at: string; error: boolean }>;
  summary: {
    claim_evidence?: Array<{ id: string; answer_quote: string; source_quote: string; relation: string; review_state: string;
      snapshot_id: string; source_title: string; source_url: string | null; platform: string }>;
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
