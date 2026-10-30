import { SCENARIOS } from './scenarios';
import type { TaskOpportunity, TaskPlan } from './task-contract';

export const taskStates: Record<string, string> = { ready_for_review: '待审核任务', needs_material: '先准备材料', needs_identity: '先核实身份', insufficient_evidence: '证据不足', not_applicable: '当前范围不适用' };
export const dimensions: Record<string, string> = { presence: '品牌出现', recommendation: '推荐强度', position: '推荐位置', reasons: '选择理由' };
export const channels: Record<string, string> = { own_website: '我方官网', material_library: '我方材料库', reference_publisher: '来源发布方' };
export const scenarioName = (value: string) => SCENARIOS[value as keyof typeof SCENARIOS] || '场景待审核';
export interface TaskScope { own: string; comparison: string; platform: string; scenario: string; opportunity: string; action: string }
export const emptyTaskScope: TaskScope = { own: '', comparison: '', platform: '', scenario: 'all', opportunity: '', action: '' };
export function readTaskScope(project: string, search = window.location.search): TaskScope {
  const p = new URLSearchParams(search);
  if (p.get('project') !== project) return emptyTaskScope;
  return { own: p.get('ownTarget') || '', comparison: p.get('compareTarget') || '', platform: p.get('platform') || '', scenario: p.get('scenario') || 'all', opportunity: p.get('opportunity') || '', action: p.get('actionId') || '' };
}
export function setTaskScope(project: string, change: Partial<TaskScope>, extra: Record<string, string> = {}) {
  const url = new URL(window.location.href);
  if (url.searchParams.get('project') !== project) url.search = '';
  url.searchParams.set('project', project);
  const names = { own: 'ownTarget', comparison: 'compareTarget', platform: 'platform', scenario: 'scenario', opportunity: 'opportunity', action: 'actionId' };
  for (const [name, value] of Object.entries(change)) { if (value) url.searchParams.set(names[name as keyof TaskScope], value); else url.searchParams.delete(names[name as keyof TaskScope]); }
  for (const [name, value] of Object.entries(extra)) url.searchParams.set(name, value);
  window.history.replaceState(window.history.state, '', url);
  window.dispatchEvent(new Event('genilink-task-scope'));
}
export function subscribeTaskScope(callback: () => void) {
  window.addEventListener('popstate', callback); window.addEventListener('genilink-task-scope', callback);
  return () => { window.removeEventListener('popstate', callback); window.removeEventListener('genilink-task-scope', callback); };
}
export function matchesOpportunity(row: TaskOpportunity, scope: TaskScope) {
  if (scope.own && scope.own !== row.own_target_id) return false;
  const observations = row.subtargets?.length ? row.subtargets : row.excluded_scopes || [];
  return observations.some(child => (!scope.platform || child.platform === scope.platform)
    && (scope.scenario === 'all' || child.scenario_id === scope.scenario)
    && (!scope.comparison || 'comparison_target_id' in child && child.comparison_target_id === scope.comparison));
}
export function planPlatforms(plan: TaskPlan) { return [...new Set(plan.target.task_pack?.ai_targets.map(row => row.platform) || [plan.target.platform])]; }
export function apiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const row = data as { error?: unknown; detail?: unknown; code?: string };
  if (row.code === 'action_dependencies_changed') return '相关证据、身份或事实已变化，请核对差异后创建新修订。';
  if (row.detail) return apiError(row.detail, fallback);
  return typeof row.error === 'string' && !row.error.startsWith('Upstream error:') ? row.error : fallback;
}
export function safeHttp(value: string | null | undefined) { return value && /^https?:\/\//i.test(value) ? value : null; }

export const dependencyName = (key: string) => ({ identity: '品牌身份与映射', questions: '问题范围与场景', interpretation: '分析解释版本', evidence: '原文证据', run: '固定审计依据', revision_integrity: '任务版本完整性' }[key] || (key.startsWith('fact:') ? '我方事实' : key.startsWith('material:') ? '我方材料版本' : key.startsWith('source:') ? '来源文章版本' : key.startsWith('review:') ? '观点人工审核' : '相关依据'));
export const taskFieldName = (field: string) => {
  const key = field.split('/').at(-1) || '';
  return ({ title: '行动标题', deliverable: '具体交付', outline: '交付提纲', acceptance: '验收标准', own_fact_ids: '选定我方事实', missing_materials: '待准备材料', ai_targets: '平台与问题目标', diagnostic_evidence: '诊断原文依据', reference_url: '材料地址', channel: '交付渠道', channel_reason: '渠道理由', questions: '原问题', subtargets: '逐平台观察', task_signature: '任务内容版本', record_id: '诊断记录', id: '观察版本', finding: '本次观察', observed_facts: '已观察事实', counterevidence: '反向证据', hypotheses: '原因假设', unknowns: '尚未确认事项' }[key] || '任务内容与依据');
};
export function readableValue(value: unknown): string {
  if (value == null) return '未提供';
  if (typeof value === 'string') return taskStates[value] || channels[value] || ({ valid: '有效', withdrawn: '已撤回', superseded: '已有新版本', expired: '已过期', needs_review: '需重新核对', verified: '已核实', confirmed: '已确认', excluded: '已排除' }[value]) || (/^[a-f0-9]{32,64}$/.test(value) ? `版本记录 ${value.slice(0, 8)}` : value);
  if (Array.isArray(value)) return value.length ? value.map(readableValue).join('\n') : '无';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const keys = ['name', 'statement', 'scope', 'status', 'quote', 'prompt', 'platform', 'scenario_id', 'relation', 'decision', 'canonical_name', 'title', 'brands', 'identities', 'name_collisions', 'aliases', 'bindings', 'snapshot_version', 'frozen', 'version', 'article_completeness'];
    const parts = keys.filter(key => row[key] !== undefined).map(key => key === 'scenario_id' ? scenarioName(String(row[key])) : readableValue(row[key]));
    return parts.length ? parts.join(' · ') : `已保存 ${Object.keys(row).length} 项版本依据`;
  }
  return String(value);
}
