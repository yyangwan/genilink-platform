import { z } from 'zod';

const id = z.string().min(1).max(200);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const platformSchema = z.enum(['qwen', 'deepseek', 'doubao', 'kimi', 'hunyuan']);
const span = z.object({
  project_id: id, run_id: id.nullable(), owner_kind: z.enum(['answer', 'citation', 'snapshot', 'owned_asset']),
  owner_id: id, segment_id: id.nullable(), text_hash: hash, quote: z.string().min(1).max(4000),
  start: z.number().int().nonnegative(), end: z.number().int().positive(),
}).strict().refine(row => row.end - row.start === Array.from(row.quote).length, '原文引用必须使用精确字符范围');
export const taskPackSchema = z.object({
  version: z.literal('task-pack-v2'), project_id: id, own_target_id: id, asset_key: id, fact_change_key: id,
  intent: z.enum(['content_create', 'content_update', 'website_update', 'fact_correction', 'channel_outreach', 'material_verification']),
  deliverable: z.string().min(5).max(4000),
  delivery: z.object({
    asset_title: z.string().min(1).max(1000), asset_kind: z.enum(['existing_material', 'new_deliverable']),
    material_revision_id: id.nullable(), material_version: z.number().int().positive().nullable(), reference_url: z.string().max(4096).nullable(),
    audience: z.array(z.string()).max(20), audience_status: z.enum(['reviewed_prompt', 'unknown']),
    outline: z.array(z.string().min(5).max(4000)).min(2).max(20),
    channel: z.enum(['own_website', 'material_library', 'reference_publisher']), channel_reason: z.string().min(5).max(4000),
    questions: z.array(z.object({ prompt_hash: hash, text: z.string().min(1).max(400000) }).strict()).min(1).max(100),
  }).strict(),
  acceptance: z.array(z.string().min(5).max(2000)).min(1).max(30),
  ai_targets: z.array(z.object({ platform: platformSchema, prompt_hash: hash, scenario_id: id,
    dimensions: z.array(z.enum(['presence', 'recommendation', 'position', 'reasons'])).min(1),
  }).strict()).min(1).max(100),
  diagnostic_evidence: z.array(span).min(1).max(100), own_fact_ids: z.array(id).max(100), missing_materials: z.array(z.string()),
}).strict();

export type TaskPack = z.infer<typeof taskPackSchema>;
export type EvidenceReference = z.infer<typeof span>;
export type Actionability = 'ready_for_review' | 'needs_material' | 'needs_identity' | 'insufficient_evidence' | 'not_applicable';
export interface TaskOpportunity {
  id: string; record_id?: string; task_key: string; task_pack: TaskPack | null; task_signature: string | null;
  finding: string; kind: string; kinds: string[]; kind_labels: string[]; own_target_id: string;
  comparison_target_ids: string[]; platforms: string[]; platform: string; prompt: string; prompt_hash: string;
  observed_facts: string[]; hypotheses: string[]; unknowns: string[]; counterevidence: EvidenceReference[];
  subtargets: Array<{ platform: string; prompt_hash: string; response_id: string; comparison_target_id: string | null;
    scenario_id: string; scenario_review_state: string; finding: string; conditions: Record<string, unknown>; actionability: string; observation_kind: string }>;
  excluded_scopes: Array<{ platform: string; prompt_hash: string; scenario_id: string; finding: string; actionability: string }>;
  actionability: Actionability; contract_error: string | null;
  material_readiness: { state: string; assets: Array<{ id: string; title: string; version: number; decision: string }>;
    registered_asset_count: number; approved_fact_candidates: Array<{ id: string; statement: string; scope: string; version: number }>;
    unmatched_approved_fact_count: number; match_basis: string };
  priority?: { rank: number; queue: string; policy_version: string; scenario_importance: number; basis: string[]; ordering_tuple: number[]; preference_mode: string };
  priority_inputs: { correction_urgency: number; evidence_readiness: number; target_coverage: number; controllability: number; outline_steps: number };
  action?: { task: string } | null;
}
export interface OpportunityPage {
  version?: string; items: TaskOpportunity[]; total: number; next_offset: number | null;
  ranking_scope: 'frozen' | 'current'; ranking_only_not_evidence_refresh?: boolean; registry_context_changed?: boolean;
  deferred?: Record<string, number>; input_quality?: Record<string, unknown>;
  status?: string; deferred_candidates?: Record<string, number>; deferred_task_count?: number;
  policy?: { version: string; preferences?: unknown };
}
export interface DependencyChange { dependency: string; before?: unknown; after?: unknown; reason: string }
export interface RevisionChanges { task: Array<{ field: string; before?: unknown; after?: unknown }>; dependencies: DependencyChange[] }
export interface TaskPlan {
  id: string; run_id: string; origin_run_id: string; revision: number; revision_id: string; revision_signature: string;
  task_key: string; title: string; status: string; approval_valid: boolean; dependency_changes: DependencyChange[];
  target: Partial<TaskOpportunity> & { platform: string; prompt?: string; action?: { task: string } | null };
}
export interface TaskRevision {
  id: string; revision: number; run_id: string; reason: string; actor_id: string; created_at: string; is_current: boolean;
  integrity_valid: boolean; payload: { title: string; target: TaskPlan['target'] }; changes_from_previous: RevisionChanges;
  approval: { id: string; reason: string; actor_id: string; historical_signature_valid: boolean } | null; draft_approval_ids: string[];
}
