'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { getAiPlatformMeta } from '@/lib/ai-platforms';
import { intelligenceUrl } from '@/lib/visibility/analysis-scope';
import { CAPTURE_PLATFORMS } from '@/lib/visibility/capture-policy';
import { auditApi, captureHref, isAuditId, isRecordId, type AuditScoreReport, type BrandTarget, type VisibilityScore } from '@/lib/visibility/v4-audit';
import { AnalysisStatusPanel } from './audit-v4-status';
import { CitationViewNav } from './citation-prototype-views';
import { useAuditCapture, useAuditResource } from './use-audit-v4';
import { useVisibilityDashboard } from './use-visibility-dashboard';
import './audit-v4.css';

const dimensions: Record<string, string> = {
  presence: '品牌出现', recommendation: '推荐强度', position: '推荐位置', reasons: '推荐理由',
};
const scenarios = {
  awareness: '认知了解', selection: '方案与品类选型', features: '功能比较', cost: '价格与成本',
  implementation: '实施适配', proof: '案例与验证', risk: '风险限制', service: '售后服务',
};
const missing: Record<string, string> = {
  directed_question: '排除定向题', question_scope_unresolved: '题目范围待核对',
  capture_missing: '未取得回答', answer_incomplete: '回答不完整', analysis_incomplete: '分析不完整',
  identity_unresolved: '品牌身份待确认', relevant_evidence_unverified: '相关证据待核对',
  recommendation_unverified: '推荐判断待核对', recommendation_reason_unverified: '推荐理由待核对',
  position_unverified: '推荐位置待核对', comparison_context_unverified: '被评价对象待确认',
  brand_observed_only_in_sources: '仅见于来源正文',
};
const noScore: Record<string, string> = {
  no_verified_samples: '本次没有可核验的计分样本。',
  no_eligible_questions: '所选范围没有可计分的问题。',
  own_brand_not_configured: '本次审计未配置自有品牌。',
};
const missingText = (reasons: Record<string, number>) => Object.entries(reasons)
  .filter(([, count]) => count > 0).map(([reason, count]) => `${missing[reason] || '待核对'} ${count}`).join(' · ');
const scenarioName = (key: string | null) => key && key in scenarios ? scenarios[key as keyof typeof scenarios] : '未归类';

function targetLabel(target: BrandTarget) {
  if (target.identity_method === 'source_only') return target.name + '（仅见于引用）';
  if (target.role === 'unregistered') return target.name + '（本次发现）';
  return target.name;
}

function ComparisonTable({ own, other, ownName = '自有品牌', otherName = '对比品牌' }: {
  own: VisibilityScore; other: VisibilityScore; ownName?: string; otherName?: string;
}) {
  return <div className="v4-table-wrap"><table className="citation-table"><thead><tr>
    <th scope="col">评分项</th><th scope="col">{ownName}</th><th scope="col">{otherName}</th>
  </tr></thead><tbody>
    <tr><th scope="row">共同样本得分</th><td>{own.value ?? '—'}</td><td>{other.value ?? '—'}</td></tr>
    {own.dimensions?.map(item => <tr key={item.dimension}>
      <th scope="row">{dimensions[item.dimension]}</th><td>{item.value ?? '—'}</td>
      <td>{other.dimensions?.find(row => row.dimension === item.dimension)?.value ?? '—'}</td>
    </tr>)}
  </tbody></table></div>;
}

function PublishedAudit({ report, projectId, auditId, params, select, captureReceived }: {
  report: AuditScoreReport; projectId: string; auditId: string; params: URLSearchParams;
  select: (key: string, value: string) => void; captureReceived?: number;
}) {
  const { score, targets, comparison } = report;
  const ownTargets = targets.filter(target => target.role === 'own');
  const own = ownTargets.find(target => target.target_id === report.own_target_id);
  const alternatives = targets.filter(target => target.target_id !== report.own_target_id);
  const other = alternatives.find(target => target.target_id === comparison?.target_id);
  const coverage = score.coverage;
  const brandsHref = intelligenceUrl(params.toString(), projectId, { auditId, runId: report.run_id, view: 'entities' });
  return <>
    <section className="citation-panel v4-panel">
      <div className="v4-score-layout">
        <div className="v4-score-summary"><h2>品牌可见性评分</h2>
          {ownTargets.length > 1 ? <label className="v4-field">自有品牌<select value={params.get('ownTarget') || report.own_target_id || ''} onChange={event => select('ownTarget', event.target.value)}>
            {ownTargets.map(target => <option value={target.target_id} key={target.target_id}>{target.name}</option>)}
          </select></label> : own && <p className="v4-note">自有品牌 · {own.name}</p>}
          <div className="v4-score">{score.value ?? '—'} <small>/ 100</small></div>
          {score.value === null ? <p className="v4-note">{noScore[score.no_score_reason || ''] || '本次暂无可用评分。'}</p>
            : coverage && <span className="v4-chip" data-tone={coverage.scored < coverage.planned ? 'warn' : 'ok'}>
              {coverage.scored < coverage.planned ? '基于部分样本' : '计分样本已齐'}</span>}
          {coverage && <p className="v4-note">{coverage.scored} / {coverage.planned} 个计分样本 · {coverage.scored_platforms} / {coverage.planned_platforms} 个平台</p>}
        </div>
        <div><h2>评分构成</h2><div className="v4-dimensions">
          {score.dimensions?.map(item => <div className="v4-subpanel" key={item.dimension}>
            <div className="v4-row"><span>{dimensions[item.dimension]}</span><strong>{item.points ?? '—'} / {item.weight}</strong></div>
            <progress className="v4-track" aria-label={dimensions[item.dimension]} value={item.points ?? 0} max={item.weight} />
          </div>)}
        </div></div>
      </div>
    </section>
    {coverage && <section className="citation-panel v4-panel" aria-label="样本覆盖">
      <div className="v4-row"><div><h2>样本覆盖</h2><p className="v4-note">
        {coverage.capture_planned} 个计划样本{captureReceived !== undefined && `，入库 ${captureReceived} 份回答`}。
        {coverage.missing_reasons.directed_question ? ` 计分计划排除 ${coverage.missing_reasons.directed_question} 个定向题次。` : ''}
      </p></div><Link className="dashboard-button dashboard-button--secondary" href={captureHref(projectId, auditId)}>核对采集记录</Link></div>
      <div className="v4-table-wrap"><table className="citation-table"><thead><tr>
        <th scope="col">平台</th><th scope="col">已评分 / 计划计分</th><th scope="col">平台分</th><th scope="col">样本情况</th>
      </tr></thead><tbody>{coverage.platforms.map(row => <tr key={row.platform}>
        <td><AiPlatformLabel platform={row.platform} /></td><td>{row.scored} / {row.planned}</td>
        <td>{row.value ?? '—'}</td><td>{missingText(row.missing_reasons) || (row.scored ? '计分样本已齐' : '暂无计分样本')}</td>
      </tr>)}</tbody></table></div>
      <p className="v4-note">缺失样本保留在覆盖统计中。{report.source_coverage && ` 引用正文已归档 ${report.source_coverage.archived} / ${report.source_coverage.observed}，可用于核对建议依据。`}</p>
    </section>}
    <section className="citation-panel v4-panel">
      <div className="v4-row"><div><h2>品牌对比</h2><p className="v4-note">按相同问题、相同平台的可评分样本计算双方得分。</p></div>
        <div className="v4-filters">
          <label>对比品牌<select value={params.get('compareTarget') || comparison?.target_id || ''} onChange={event => select('compareTarget', event.target.value)}>
            <option value="">自动选择</option>{alternatives.map(target => <option key={target.target_id} value={target.target_id}>{targetLabel(target)}</option>)}
          </select></label>
          <label>目标平台<select value={params.get('platform') || ''} onChange={event => select('platform', event.target.value)}>
            <option value="">全部平台</option>{CAPTURE_PLATFORMS.map(platform => <option value={platform} key={platform}>{getAiPlatformMeta(platform).label}</option>)}
          </select></label>
          <label>需求场景<select value={params.get('scenario') || ''} onChange={event => select('scenario', event.target.value)}>
            <option value="">全部场景</option>{Object.entries(scenarios).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
        </div>
      </div>
      {other && ['unresolved', 'observed_name', 'source_only'].includes(other.identity_method) && <p className="v4-warn">
        {other.identity_method === 'source_only' ? '该品牌仅在引用正文中出现。' : other.identity_method === 'observed_name' ? '本次对比使用回答中明确出现的名称，品牌身份可另行确认。' : '该品牌身份仍有待确认。'}
        {' '}<Link className="v4-link" href={brandsHref}>品牌身份确认 →</Link>
      </p>}
      {comparison ? <>
        <p className="v4-note">共同样本 {comparison.common_sample_count} / {comparison.scope_planned}
          {comparison.own_only_count > 0 ? ` · 仅自有品牌有分 ${comparison.own_only_count}` : ''}
          {comparison.comparison_only_count > 0 ? ` · 仅对比品牌有分 ${comparison.comparison_only_count}` : ''}</p>
        {comparison.own && comparison.other ? <ComparisonTable own={comparison.own} other={comparison.other} ownName={own?.name} otherName={other?.name} />
          : <p className="v4-note">当前范围暂无双方均可核验的样本。</p>}
      </> : <p className="v4-note">当前范围暂无可进行同样本比较的品牌。</p>}
    </section>
    <section className="citation-panel v4-panel">
      <h2>优化建议</h2>
      {!report.recommendations.length && <p className="v4-note">当前对比范围暂无有充分证据的改进建议。</p>}
      {report.recommendations.map(item => {
        const source = item.source_support.find(row => row.ordinal !== null);
        const snapshot = source && source.ordinal !== null ? { ordinal: source.ordinal, snapshot_id: source.snapshot_id } : undefined;
        const actionHref = intelligenceUrl(params.toString(), projectId, {
          auditId, runId: report.run_id, view: 'actions', ownTarget: report.own_target_id || null,
          compareTarget: comparison?.target_id || null,
          ...(item.action_opportunity ? {
            opportunity: item.action_opportunity.id, platform: item.platform, scenario: item.action_opportunity.scenario,
          } : {}),
        }, true);
        return <article className="v4-subpanel v4-recommendation" key={item.id}>
          <div className="v4-row"><div><h3>{item.title}</h3><p className="v4-note">{scenarioName(item.scenario)} · {dimensions[item.dimension]} · {item.observed_gap_samples} / {item.common_samples_in_scope} 个共同样本观察到差距</p></div><AiPlatformLabel platform={item.platform} /></div>
          <p className="v4-note">问题 · {item.prompt}</p>
          <blockquote className="v4-quote">{item.observed_reason || item.evidence[0]?.quote}</blockquote>
          <p><strong>交付方向</strong>　{item.deliverable}</p>
          <p className="v4-note"><strong>复测</strong>　{item.success_check}</p>
          <div className="v4-controls">
            <Link className="dashboard-button dashboard-button--secondary" href={captureHref(projectId, auditId, item.sample_id)}>核对原始回答</Link>
            {snapshot && <Link className="dashboard-button dashboard-button--secondary" href={captureHref(projectId, auditId, item.sample_id, snapshot)}>核对引用正文</Link>}
            <Link className="dashboard-button dashboard-button--secondary" href={actionHref}>查看优化行动</Link>
          </div>
        </article>;
      })}
    </section>
  </>;
}

export function AuditInsightV4({ projectId, legacy }: { projectId: string; legacy?: ReactNode }) {
  const search = useSearchParams(), router = useRouter();
  const params = new URLSearchParams(search.get('project') === projectId ? search.toString() : '');
  params.set('project', projectId);
  const dashboard = useVisibilityDashboard(projectId, 'collection');
  const explicitAudit = params.get('auditId');
  const auditId = isAuditId(explicitAudit) ? explicitAudit : dashboard.data?.latest_audit?.id || '';
  const capture = useAuditCapture(projectId, auditId);
  const currentRun = capture.data?.published_run_id;
  const selections: Record<string, string> = {};
  for (const field of ['ownTarget', 'compareTarget', 'platform', 'scenario']) {
    const value = params.get(field);
    if (value) selections[field] = value;
  }
  const score = useAuditResource<AuditScoreReport>(
    auditId && currentRun && capture.data?.mode === 'v4' ? auditApi('visibilityScore', projectId, auditId, selections) : null,
    currentRun,
    true,
  );
  const published = score.data?.audit_id === auditId && score.data.status === 'published' ? score.data : null;
  const select = (key: string, value: string) => {
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === 'ownTarget' && params.get('compareTarget') === value) params.delete('compareTarget');
    router.replace(intelligenceUrl(params.toString(), projectId, { auditId, view: 'overview', runId: isRecordId(currentRun ?? null) ? currentRun ?? null : null }), { scroll: false });
  };
  if (legacy && capture.data && capture.data.mode !== 'v4') return legacy;
  return <div className="audit-workspace citation-workspace audit-v4">
    <header className="citation-page-head"><div><span>AUDIT INSIGHT</span><h1>审计洞察</h1><p>核对本次品牌表现、评分范围和可执行的优化方向。</p></div>
      <div className="citation-page-actions">
        {auditId && <Link className="dashboard-button dashboard-button--secondary" href={captureHref(projectId, auditId)}>查看采集记录</Link>}
        <Link className="dashboard-button dashboard-button--secondary" href={'/audits?project=' + encodeURIComponent(projectId)}>历史审计</Link>
      </div>
    </header>
    <CitationViewNav value="overview" onChange={view => {
      if (view !== 'overview') router.replace(intelligenceUrl(params.toString(), projectId, { view, auditId: auditId || null, runId: currentRun || null }), { scroll: false });
    }} />
    {auditId && <p className="v4-note">审计 #{auditId}</p>}
    {!auditId && dashboard.loading && <p role="status">正在读取项目审计…</p>}
    {!auditId && dashboard.locked && <p role="alert" className="v4-warn">当前项目权限或订阅不支持查看审计。</p>}
    {!auditId && dashboard.error && <p role="alert" className="v4-warn">审计列表暂不可用。 <button className="v4-link" type="button" onClick={dashboard.refetch}>重新查询</button></p>}
    {capture.error && <p role="alert" className="v4-warn">{capture.error} <button className="v4-link" type="button" onClick={capture.refetch}>重新查询状态</button></p>}
    {score.error && <p role="alert" className="v4-warn">{score.error} <button className="v4-link" type="button" onClick={score.refetch}>重新查询结果</button></p>}
    {score.loading && <p role="status" className="v4-note">{published ? '正在更新对比范围…' : '正在读取评分结果…'}</p>}
    {published && <div className="v4-result-stack" aria-busy={score.loading}><PublishedAudit report={published} projectId={projectId} auditId={auditId} params={params} select={select}
      captureReceived={capture.data?.capture?.received} /></div>}
    <AnalysisStatusPanel key={auditId} projectId={projectId} auditId={auditId} capture={capture.data} onRetry={capture.refetch} refreshing={capture.loading} />
  </div>;
}
