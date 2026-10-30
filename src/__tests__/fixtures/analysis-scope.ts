import type { BrandScoreAggregate, BrandScoreDimension, EvidenceRun } from '@/types/intelligence';
import { opportunity, question, runId, taskPack } from './task-workspace';
import type { TaskOpportunity } from '@/lib/visibility/task-contract';

export const aggregate = (score: number | null): BrandScoreAggregate => ({ rule_version: 'brand-visibility-v1', cohort_hash: 'fixture', score, covered_weight: score === null ? 0 : 1, missing_sample_ids: [], status: score === null ? 'pending' : 'complete' });
const dims = (score: number | null) => Object.fromEntries(['presence', 'recommendation', 'position', 'reasons'].map(key => [key, aggregate(score)])) as Record<BrandScoreDimension, BrandScoreAggregate>;
export function analysisRun(): EvidenceRun {
  const targets = [['registry:own', '云衡', 'own', 'own-entity'], ['entity:rival', '锐川', 'competitor', 'rival'], ['entity:new', '拓域', 'unregistered', 'new']].map(([id, name, role, entity]) => ({ target_id: id, registry_brand_id: role === 'own' ? 'own' : null, entity_id: entity, name, names: [name], role, identity_status: 'confirmed', reason_codes: [], source_mentions: 1, presence_counts: { present: 2 } }));
  const scores = targets.flatMap((target, index) => ['all', 'qwen', 'doubao'].map(platform => ({ target_id: target.target_id, platform, total: aggregate(platform === 'all' ? 91 - index * 4 : platform === 'qwen' ? 60 + index * 10 : 30 + index * 10), dimensions: dims(platform === 'qwen' ? 60 : 30) })));
  return { id: runId, audit_id: '99', revision: 3, status: 'partial', created_at: '2026-10-25T08:00:00Z',
    coverage: { responses: 3, sources: 1, captured_sources: 1, total_characters: 5000, analyzed_characters: 3000 }, sources: [],
    responses: [{ id: 'b'.repeat(32), platform: 'qwen', prompt: question, prompt_hash: taskPack().delivery.questions[0].prompt_hash, observed_at: '', error: false },
      { id: '5'.repeat(32), platform: 'doubao', prompt: question, prompt_hash: taskPack().delivery.questions[0].prompt_hash, observed_at: '', error: false },
      { id: '6'.repeat(32), platform: 'qwen', prompt: '价格如何？', prompt_hash: '6'.repeat(64), observed_at: '', error: false }],
    summary: { entities: targets.map(row => ({ id: row.entity_id, name: row.name, role: row.role, kind: 'brand', identity_status: row.identity_status, response_count: 2, source_mentions: 1, platform_response_counts: { qwen: 1, doubao: 1 } })),
      brand_presence: { version: 'brand-presence-v1', mapping_hash: 'fixture', targets, scope_scores: scores,
        observations: targets.flatMap(target => ['qwen', 'doubao'].map(platform => ({ target_id: target.target_id, entity_id: target.entity_id, sample_id: platform === 'qwen' ? 'sample-q' : 'sample-d', response_id: platform === 'qwen' ? 'b'.repeat(32) : '5'.repeat(32), platform, state: 'present' as const, reason_codes: [], evidence_ids: [], coverage_complete: true, score: 60, dimensions: { presence: 60, recommendation: 60, position: 60, reasons: 60 } }))) },
      scenario_comparison: { version: 'scenario-comparison-v1', taxonomy: { implementation: '实施适配', cost: '价格与成本' }, total_questions: 2, reviewed_questions: 2,
        questions: [{ prompt_hash: taskPack().delivery.questions[0].prompt_hash, primary_scenario: 'implementation' }, { prompt_hash: '6'.repeat(64), primary_scenario: 'cost' }],
        scope_scores: scores.map(score => ({ ...score, scenario: 'implementation', sample_count: 2, sample_ids: score.platform === 'qwen' ? ['sample-q'] : score.platform === 'doubao' ? ['sample-d'] : ['sample-q', 'sample-d'] })) },
      platforms: ['qwen', 'doubao'].map(platform => ({ platform, responses: platform === 'qwen' ? 2 : 1, analyzed_responses: 1, source_observations: 1, snapshot_count: 1 })),
      mentions: [], claims: [], diagnoses: [], claim_evidence: [] } };
}
export function analysisOpportunities(): TaskOpportunity[] {
  const first = opportunity({ subtargets: opportunity().subtargets.map(row => ({ ...row, response_id: row.platform === 'qwen' ? 'b'.repeat(32) : '5'.repeat(32) })) });
  return [first, opportunity({ id: '7'.repeat(64), record_id: '7'.repeat(32), task_key: '7'.repeat(64), finding: '豆包回答中出现拓域的实施案例，我方对应材料仍需核实。',
    observed_facts: ['豆包回答列出了拓域的实施边界。'], comparison_target_ids: ['entity:new'], platforms: ['doubao'],
    task_pack: { ...taskPack(), deliverable: '核实我方案例与实施范围说明', ai_targets: [taskPack().ai_targets[1]],
      diagnostic_evidence: [{ ...taskPack().diagnostic_evidence[0], owner_id: '5'.repeat(32), quote: taskPack().diagnostic_evidence[0].quote.replace('锐川', '拓域'), text_hash: '7'.repeat(64) }] },
    subtargets: [{ ...first.subtargets[1], platform: 'doubao', comparison_target_id: 'entity:new', response_id: '5'.repeat(32) }], priority: { ...opportunity().priority!, rank: 2 } })];
}
