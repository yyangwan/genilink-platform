"use client";
import type { EvidenceRun } from '@/types/intelligence';
import { analysisPlatforms, analysisTargets, scopeIssues } from '@/lib/visibility/analysis-scope';
import { SCENARIOS } from '@/lib/visibility/scenarios';
import type { TaskScope } from '@/lib/visibility/task-view';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import './analysis-scope.css';

export function AnalysisScopeBar({ run, scope, onChange }: { run: EvidenceRun; scope: TaskScope; onChange: (change: Partial<TaskScope>) => void }) {
  const targets = analysisTargets(run), own = targets.filter(row => row.role === 'own'), comparisons = targets.filter(row => row.target_id !== scope.own), platforms = analysisPlatforms(run);
  const issues = scopeIssues(run, scope);
  return <section className="citation-panel citation-pad analysis-scope" aria-label="统一比较范围"><div className="analysis-scope-controls">
    <label>自有品牌<select aria-label="自有品牌" value={scope.own} onChange={event => onChange({ own: event.target.value })}>
      <option value="">选择自有品牌</option>{scope.own && !own.some(row => row.target_id === scope.own) && <option value={scope.own}>原自有品牌已失效，请重选</option>}
      {own.map(row => <option key={row.target_id} value={row.target_id}>{row.name}{row.identity_status !== 'confirmed' ? ' · 身份待核实' : ''}</option>)}</select></label>
    <label>对比品牌<select aria-label="对比品牌" value={scope.comparison} onChange={event => onChange({ comparison: event.target.value })}>
      <option value="">全部比较主体</option>{scope.comparison && !comparisons.some(row => row.target_id === scope.comparison) && <option value={scope.comparison}>原比较对象已失效，请重选</option>}
      {comparisons.map(row => <option key={row.target_id} value={row.target_id}>{row.name}{row.identity_status !== 'confirmed' ? ' · 身份待核实' : row.role === 'unregistered' ? ' · 未登记主体' : ''}</option>)}</select></label>
    <label>目标平台<select aria-label="目标平台" value={scope.platform} onChange={event => onChange({ platform: event.target.value })}><option value="">全部平台</option>
      {scope.platform && !platforms.includes(scope.platform) && <option value={scope.platform}>原平台不在本次范围内</option>}{platforms.map(name => <option key={name} value={name}>{getAiPlatformLabel(name)}</option>)}</select></label>
    <label>需求场景<select aria-label="需求场景" value={scope.scenario} onChange={event => onChange({ scenario: event.target.value })}><option value="all">全部场景</option>
      {scope.scenario !== 'all' && scope.scenario !== 'unreviewed' && !Object.hasOwn(SCENARIOS, scope.scenario) && <option value={scope.scenario}>原场景已失效，请重选</option>}
      {Object.entries(SCENARIOS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}<option value="unreviewed">场景待审核</option></select></label>
  </div><p className="citation-muted">审计 {run.audit_id} · 修订 {run.revision} · 每题每平台一次 · 固定规则 v1。选择跨页保留，原问题与证据归属保持不变。</p>
    {!!issues.length && <p role="status" className="citation-notice citation-notice--warning">{issues.join('；')}。请明确重选，未自动替换为其他对象。</p>}
    {!scope.own && <p className="citation-muted">请选择自有品牌以查看对应竞争机会；全部观察材料仍可核对。</p>}
  </section>;
}
