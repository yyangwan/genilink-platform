import type { TaskOpportunity, TaskPack, TaskPlan } from '@/lib/visibility/task-contract';
import type { EvidenceRun } from '@/types/intelligence';

export const project = 'test-project', runId = 'a'.repeat(32), actionId = 'f'.repeat(32);
const taskKey = '77ec81df9bac3f3db43cc5c4c9aa9588626ee7b44335f911bdd03599c67d050e';
export const question = '多门店企业如何核对权限与实施范围？';
export const fullText = '🧭锐川列明总部与门店的实施边界，仅限专业版。';
const promptHash = '53da788bd1a78352010e9cd41c596546275379f3deeee23f86457d583ccf03c4';
export function taskPack(): TaskPack {
  return { version: 'task-pack-v2', project_id: project, own_target_id: 'registry:own', asset_key: 'new:implementation', fact_change_key: 'implementation-boundary', intent: 'content_create',
    deliverable: '补齐我方门店权限与实施边界说明', delivery: { asset_title: '我方实施说明', asset_kind: 'new_deliverable', material_revision_id: null, material_version: null, reference_url: null,
      audience: ['多门店企业'], audience_status: 'reviewed_prompt', channel: 'own_website', channel_reason: '让客户能够核对我方实施条件与限定范围',
      outline: ['说明总部、区域和门店的实施职责', '逐项列明版本、限制及原文证明材料'], questions: [{ prompt_hash: promptHash, text: question }] },
    acceptance: ['每项主张都保留我方材料原文及适用范围'], ai_targets: [
      { platform: 'qwen', prompt_hash: promptHash, scenario_id: 'implementation', dimensions: ['reasons'] },
      { platform: 'doubao', prompt_hash: promptHash, scenario_id: 'implementation', dimensions: ['recommendation'] },
    ], diagnostic_evidence: [{ project_id: project, run_id: runId, owner_kind: 'answer', owner_id: 'b'.repeat(32), segment_id: 'c'.repeat(32),
      text_hash: 'eb6bb1f9b59a574abee95cdc733c862fa5a180e733eb9f42ab1e121d1ffc4ae5', quote: fullText.slice(2), start: 1, end: Array.from(fullText).length }], own_fact_ids: [], missing_materials: ['核实我方权限范围、适用版本及实施证明'] };
}
export function opportunity(overrides: Partial<TaskOpportunity> = {}): TaskOpportunity {
  return { id: 'd'.repeat(64), record_id: 'd'.repeat(32), task_key: taskKey, task_pack: taskPack(), task_signature: '9'.repeat(64),
    finding: '千问的回答对锐川保留了具体实施边界，我方材料尚待核对。', kind: 'content_evidence', kinds: ['content_evidence'], kind_labels: ['内容证据机会'],
    own_target_id: 'registry:own', comparison_target_ids: ['entity:rival'], platforms: ['qwen', 'doubao'], platform: 'qwen', prompt: question, prompt_hash: promptHash,
    observed_facts: ['锐川原文保留总部与门店边界及版本限制。'], hypotheses: ['可补齐我方说明，但不能证明补齐后平台会推荐。'], unknowns: ['我方材料不足不代表我方缺少该能力。'], counterevidence: [],
    subtargets: ['qwen', 'doubao'].map(platform => ({ platform, prompt_hash: promptHash, response_id: 'b'.repeat(32), comparison_target_id: 'entity:rival', scenario_id: 'implementation', scenario_review_state: 'confirmed', finding: platform === 'qwen' ? '千问保留实施限定。' : '豆包未保留对应限定，原因尚未确认。', conditions: { surface: 'app', searchMode: 'unknown' }, actionability: 'needs_material', observation_kind: 'answer' })),
    excluded_scopes: [], actionability: 'needs_material', contract_error: null,
    material_readiness: { state: 'no_registered_material', assets: [], registered_asset_count: 0, approved_fact_candidates: [], unmatched_approved_fact_count: 0, match_basis: 'literal_topic_in_approved_statement_and_scope_not_entailment' },
    priority: { rank: 1, queue: 'preparation', policy_version: 'policy-v1', scenario_importance: 90, basis: ['先核对证据与材料，再按业务场景重要性处理'], ordering_tuple: [0, 90, 1, 2, 2, -2], preference_mode: 'custom' },
    priority_inputs: { correction_urgency: 0, evidence_readiness: 1, target_coverage: 2, controllability: 2, outline_steps: 2 }, action: { task: '补齐我方门店权限与实施边界说明' }, ...overrides };
}
export function plan(overrides: Partial<TaskPlan> = {}): TaskPlan {
  return { id: actionId, run_id: runId, origin_run_id: runId, revision: 1, revision_id: '1'.repeat(32), revision_signature: '2'.repeat(64), task_key: taskKey,
    title: '补齐我方门店权限与实施边界说明', status: 'proposed', approval_valid: false, dependency_changes: [], target: opportunity(), ...overrides };
}
export const run = { id: runId, summary: { diagnoses: [], brand_presence: { targets: [
  { target_id: 'registry:own', registry_brand_id: 'own', name: '云衡', role: 'own', identity_status: 'confirmed' },
  { target_id: 'entity:rival', name: '锐川', role: 'unregistered', identity_status: 'confirmed' },
  { target_id: 'entity:other', name: '朗测', role: 'unregistered', identity_status: 'pending' },
] } } } as unknown as EvidenceRun;
