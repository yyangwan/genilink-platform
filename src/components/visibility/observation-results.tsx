"use client";
import { useState } from 'react';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { chinaTime, type ObservationCohort, type ObservationResult } from '@/lib/visibility/observation-contract';
import './observation-workspace.css';

const metricNames: Record<string, string> = { presence: '品牌出现', recommendation: '推荐强度', position: '推荐位置', reasons: '选择理由', cited_card_presence: '实际引用卡片', cited_archive_presence: '已保存来源正文', candidate_card_presence: '检索候选卡片' };
const roleNames: Record<string, string> = { own: '自有品牌', competitor: '已登记竞品', unregistered: '未登记品牌', comparison: '对比品牌' };
const states: Record<string, string> = { comparable: '条件可比', conditions_unverified: '条件待确认', incompatible: '不可比', missing: '数据缺失' };
export const observationReasons: Record<string, string> = {
  sample_missing: '未取得对应回答', incomplete_answer: '回答尚不完整', unknown_conditions: '采集条件待确认', conditions_changed: '实际采集条件已变化',
  observation_not_later: '复测时间不晚于基线', identity_unconfirmed: '品牌身份未确认', metric_unknown: '部分事实未知', snapshot_not_current: '已有更新的分析或配置',
  analysis_signature_changed: '分析口径已变化', score_rule_changed: '评分规则已变化', question_scope_changed: '问题范围已变化', prompt_version_changed: '原问题版本已变化',
  entity_mapping_changed: '品牌映射已变化', brand_name_scope_changed: '品牌名称范围已变化', observation_missing: '未取得该项观察',
  source_brand_entity_unbound: '来源中的品牌尚未绑定', source_analysis_unknown: '来源分析未完成', brand_observation_missing: '品牌观察未完成',
};
const reasonText = (items: string[]) => items.map(item => observationReasons[item] || '证据或条件尚待核对').join('；');
const valueLabel = (value: { value: number | null; known: boolean }, unit: string) => !value.known || value.value === null ? '未知' : unit === 'presence_0_1' ? value.value === 1 ? '出现' : '未出现' : `${value.value.toFixed(1)} / 100`;
export function ObservationResults({ result, cohort, onOpen, platformFilter = '' }: { result: ObservationResult; cohort?: ObservationCohort; onOpen?: (runId: string, kind: string, id: string) => void; platformFilter?: string }) {
  const [brand, setBrand] = useState(result.brand_targets.find(row => row.role === 'own')?.target_id || result.brand_targets[0]?.target_id || ''), [selectedPlatform, setPlatform] = useState('');
  const platform = platformFilter || selectedPlatform;
  return <section className="citation-panel observation-workspace" aria-label="逐平台观察"><div className="citation-section-head"><div><p className="audit-eyebrow">OBSERVED RESULTS</p><h2>逐平台观察</h2></div><span className="citation-tag">固定规则 v1 · 单轮描述</span></div>
    <p className="citation-muted">前后事实分别保留。仅在条件可比、双方数值明确时显示差值；未知不按零分处理。</p>
    {result.action_link && <p className="citation-muted">冻结行动：{result.action_link.action_title} · 修订 {result.action_link.revision} · 观察保存于 {chinaTime(result.created_at)}</p>}
    {!result.snapshot_current && <p role="status" className="citation-notice">已有更新的分析或配置。本记录供历史回查，当前变化结论已停用。</p>}
    <div className="observation-tabs" role="tablist" aria-label="观察品牌">{result.brand_targets.map(row => <button key={row.target_id} role="tab" aria-selected={brand === row.target_id} onClick={() => setBrand(row.target_id)}>{row.name} · {roleNames[row.role] || '对比品牌'}</button>)}</div>
    {!platformFilter && <div className="observation-platforms" aria-label="结果平台"><button aria-pressed={!platform} onClick={() => setPlatform('')}>全部平台</button>{result.platforms.map(row => <button key={row.platform} aria-pressed={platform === row.platform} onClick={() => setPlatform(row.platform)}><AiPlatformLabel platform={row.platform} iconSize={20} /></button>)}</div>}
    {result.platforms.filter(row => !platform || row.platform === platform).map(row => <section key={row.platform} className="observation-platform-result"><h3><AiPlatformLabel platform={row.platform} iconSize={22} /></h3>
      {row.observations.map(cell => <article key={cell.baseline_sample_id} className="observation-cell"><div className="citation-section-head"><p>{cohort?.questions.find(q => q.platform === row.platform && q.prompt_hash === cell.prompt_hash)?.text || '冻结的原问题（原文见回答）'}</p><span className="citation-tag">{states[cell.comparison_state] || '待核对'}</span></div>
        <div className="observation-time-chain"><div><small>基线回答</small><b>{chinaTime(cell.baseline_observed_at)}</b></div><span>→</span><div><small>实际发布</small><b>{result.action_link?.publications.length ? result.action_link.publications.map(item => chinaTime(item.published_at)).join(' / ') : '尚未登记'}</b></div><span>→</span><div><small>本次复测回答</small><b>{chinaTime(cell.followup_observed_at)}</b></div></div>
        <p className="citation-muted">{cell.publication_window?.status === 'time_ordered' ? '时间顺序符合发布前后观察。时间关联不证明变化由该行动造成。' : cell.publication_window?.status === 'publication_not_registered' || !cell.publication_window ? '尚无关联发布记录，只比较前后回答事实。' : cell.publication_window.status === 'snapshot_not_current' ? '记录仅供历史回查，不能用于当前发布效果判断。' : '发布时间未落在两次回答之间，或采样时间不明；不作为发布前后效果结论。'}</p>
        <table className="observation-metric-table"><thead><tr><th>观察维度</th><th>基线事实</th><th>复测事实</th><th>本次观察</th><th>原文</th></tr></thead><tbody>{cell.targets.find(item => item.brand_target_id === brand)?.metrics.map(metric => {
          const delta = result.snapshot_current && metric.comparison_state === 'comparable' && metric.baseline.known && metric.followup.known ? metric.observed_delta : null;
          return <tr key={metric.metric}><td>{metricNames[metric.metric] || '来源正文提及'}</td><td data-label="基线">{valueLabel(metric.baseline, metric.unit)}</td><td data-label="复测">{valueLabel(metric.followup, metric.unit)}</td><td data-label="观察"><span className={delta !== null && delta < 0 ? 'observation-negative' : delta !== null && delta > 0 ? 'observation-positive' : ''}>{delta !== null ? delta === 0 ? '本次未变化' : metric.unit === 'presence_0_1' ? delta > 0 ? '本次由未出现到出现' : '本次由出现到未出现' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} 分` : states[metric.comparison_state] || '尚不可判断'}</span><small>{reasonText(metric.reason_codes)}</small></td><td><div className="observation-evidence-links">{cell.baseline_response_id && <button className="citation-link" onClick={() => onOpen?.(result.baseline_run_id, 'answer', cell.baseline_response_id!)} disabled={!onOpen}>基线原文</button>}{cell.followup_response_id && <button className="citation-link" onClick={() => onOpen?.(result.followup_run_id, 'answer', cell.followup_response_id!)} disabled={!onOpen}>复测原文</button>}
            {[...metric.baseline.source_traces.map(trace => ({ trace, run: result.baseline_run_id })), ...metric.followup.source_traces.map(trace => ({ trace, run: result.followup_run_id }))].map(({ trace, run }, i) => {
              const kind = trace.owner_kind, owner = trace.owner_id;
              return typeof owner === 'string' && ['snapshot', 'citation', 'answer'].includes(String(kind)) ? <button className="citation-link" key={i} disabled={!onOpen} onClick={() => onOpen?.(run, String(kind), owner)}>来源依据 {i + 1}</button> : null;
            })}</div></td></tr>;
        })}</tbody></table>
      </article>)}
    </section>)}
    <p className="citation-muted">这些数据描述两次回答之间的变化，不代表稳定效果或行动归因。引用卡片、保存正文和检索候选分别计量；正文含品牌不证明模型采用了该段内容。</p>
  </section>;
}
