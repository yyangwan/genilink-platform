import type { EvidenceRun } from '@/types/intelligence';
import { SCENARIOS } from './scenarios';
import type { TaskScope } from './task-view';
import type { TaskOpportunity } from './task-contract';

export function analysisTargets(run: Pick<EvidenceRun, 'summary'>) {
  return run.summary.brand_presence?.targets || (run.summary.entities || []).map(row => ({
    target_id: `entity:${row.id}`, entity_id: row.id, registry_brand_id: null,
    name: row.name, role: row.role, identity_status: row.identity_status,
  }));
}
export function analysisPlatforms(run: EvidenceRun) {
  return [...new Set([...run.responses.map(row => row.platform), ...(run.summary.platforms || []).map(row => row.platform)])];
}
export function scopeIssues(run: EvidenceRun, scope: TaskScope) {
  const targets = analysisTargets(run), problems: string[] = [];
  if (scope.own && !targets.some(row => row.target_id === scope.own && row.role === 'own')) problems.push('原自有品牌不在本次分析范围内');
  if (scope.comparison && (!targets.some(row => row.target_id === scope.comparison) || scope.comparison === scope.own)) problems.push('原比较对象失效或与自有品牌相同');
  if (scope.platform && !analysisPlatforms(run).includes(scope.platform)) problems.push('本次没有原平台的回答');
  if (scope.scenario !== 'all' && scope.scenario !== 'unreviewed' && !Object.hasOwn(SCENARIOS, scope.scenario)) problems.push('原场景已失效');
  return problems;
}
/** Brand context must not discard neutral answers or evidence in which neither brand appears. */
export function scopeResponseIds(run: EvidenceRun, scope: Pick<TaskScope, 'platform' | 'scenario'>) {
  const prompts = new Set(run.summary.scenario_comparison?.questions.filter(row => scope.scenario === 'unreviewed' ? !row.primary_scenario : row.primary_scenario === scope.scenario).map(row => row.prompt_hash) || []);
  return new Set(run.responses.filter(row => (!scope.platform || row.platform === scope.platform) &&
    (scope.scenario === 'all' || prompts.has(row.prompt_hash))).map(row => row.id));
}
export function originalOpportunityScope(row: TaskOpportunity): Partial<TaskScope> {
  const platforms = [...new Set(row.platforms || row.task_pack?.ai_targets.map(target => target.platform) || [])];
  const scenarios = [...new Set(row.subtargets?.map(target => target.scenario_id) || row.task_pack?.ai_targets.map(target => target.scenario_id) || [])];
  const comparisons = [...new Set(row.comparison_target_ids || [])];
  return { own: row.own_target_id || row.task_pack?.own_target_id || '', comparison: comparisons.length === 1 ? comparisons[0] : '',
    platform: platforms.length === 1 ? platforms[0] : '', scenario: scenarios.length === 1 ? scenarios[0] : 'all' };
}
export function intelligenceUrl(search: string, project: string, change: Record<string, string | null>, switchRun = false) {
  const params = new URLSearchParams(search);
  if (params.get('project') !== project) { for (const key of [...params.keys()]) params.delete(key); }
  params.set('project', project);
  if (switchRun) ['opportunity', 'actionId', 'evidenceId', 'taskEvidence'].forEach(key => params.delete(key));
  for (const [key, value] of Object.entries(change)) { if (value === null || value === '') params.delete(key); else params.set(key, value); }
  return '/intelligence?' + params;
}
export function readPriority(project: string, search: string) {
  const params = new URLSearchParams(search);
  return params.get('project') === project && params.get('priority') === 'current' ? 'current' : 'frozen';
}
