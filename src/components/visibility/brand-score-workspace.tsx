"use client";

import { useState, type ReactNode } from 'react';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import type { BrandScoreDimension, EvidenceRun } from '@/types/intelligence';
import './brand-score-workspace.css';

const dimensions: Array<[BrandScoreDimension, string]> = [
  ['presence', '品牌出现'], ['recommendation', '推荐强度'], ['position', '推荐位置'], ['reasons', '选择理由'],
];
const display = (score: number | null | undefined) => typeof score === 'number' && Number.isFinite(score) ? String(score) : '—';

export function BrandScoreWorkspace({ run, mode = 'brands', onEvidence, onPlatformSelect, readinessPanel }: {
  readinessPanel?: ReactNode; run: EvidenceRun; mode?: 'brands' | 'overview' | 'platforms'; onEvidence?: (responseId: string) => void; onPlatformSelect?: (platform: string) => void;
}) {
  const presence = run.summary.brand_presence;
  const hasEvaluation = !!run.summary.brand_evaluation || !!presence?.scope_scores.length;
  const evaluation = run.summary.brand_evaluation || {
    version: 'brand-visibility-v1', weights: { presence: 30, recommendation: 30, position: 20, reasons: 20 },
    cohort_hash: null, status: 'missing_planned_cohort', score: null, brand_scores: [], answer_scores: [],
    comparison: { version: 'competitive-comparison-v1', minimum_gap_points: 10, candidate_gap_count: 0,
      interpretation: 'single_audit_observation', ordering_basis: 'observed_gap_not_business_priority', threshold_note: '', scope_scores: [], gaps: [] },
  } satisfies NonNullable<EvidenceRun['summary']['brand_evaluation']>;
  const brands = presence ? presence.targets.map(target => ({ id: target.target_id, name: target.name, role: target.role, identity_status: target.identity_status })) : (run.summary.entities || []).filter(entity => ['brand', 'organization', 'product'].includes(entity.kind));
  const own = brands.find(entity => entity.role === 'own' && entity.identity_status === 'confirmed');
  const candidates = brands.filter(entity => entity.id !== own?.id && entity.identity_status === 'confirmed');
  const [comparisonId, setComparisonId] = useState('');
  const comparison = candidates.find(entity => entity.id === comparisonId) || candidates[0];
  const platforms = Array.from(new Set([...(evaluation.comparison?.scope_scores.filter(row => row.axis === 'platform').map(row => String(row.scope)) || []), ...run.responses.map(row => row.platform), ...(run.summary.platforms || []).map(row => row.platform)]));
  const [platformValue, setPlatform] = useState('all');
  const platform = platformValue === 'all' || platforms.includes(platformValue) ? platformValue : 'all';
  const scopeRow = (brandId: string | undefined, name = platform) => presence
    ? presence.scope_scores.find(row => row.platform === name && row.target_id === brandId)
    : evaluation.comparison?.scope_scores.find(row => row.axis === (name === 'all' ? 'overall' : 'platform') && row.scope === name && row.entity_id === brandId);
  const scoreFor = (brandId: string | undefined) => presence ? scopeRow(brandId, 'all')?.total : evaluation.brand_scores.find(row => row.entity_id === brandId);
  const ownScore = scoreFor(own?.id);
  const evidenceRows = (brandId: string) => presence ? presence.observations.filter(row => row.target_id === brandId) : evaluation.answer_scores.filter(row => row.entity_id === brandId);
  const rows = (own ? [own, comparison] : []).filter((entity): entity is NonNullable<typeof entity> => !!entity);
  const point = (value: number, index: number) => [190 + Math.sin(index * Math.PI / 2) * value, 170 - Math.cos(index * Math.PI / 2) * value];
  const points = (values: number[]) => values.map((value, index) => point(value, index).join(',')).join(' ');
  return <div className="brand-score-workspace">
    {!hasEvaluation && <p role="status" className="citation-notice citation-notice--warning">当前审计修订尚未生成新版评分。新版分析布局已展示，分数和图表数据待分析完成后填充；不会把未知数据按零分处理。</p>}
    {mode === 'overview' && <section className="citation-panel citation-pad brand-score-conclusion">
      <div><span className="citation-muted">本次品牌评价 · 固定规则 v1</span><h2>{own?.name || '自有品牌身份待确认'}</h2>
        <p>{ownScore?.score === 0 ? '本次纳入评价的回答未提及该品牌。优先核对选型场景对应的内容与可核实材料。' : ownScore?.score != null ? '本次已观察到该品牌，可按平台核对分项差距与原文依据。' : '评分依据尚不完整，暂不发布品牌总分。'}</p>
        <small>本次审计快照 · 未采集、未分析与未知不计为零分</small></div>
      <strong>{display(ownScore?.score)}<small>/ 100</small></strong>
    </section>}
    {mode === 'overview' && readinessPanel}
    {mode === 'overview' && !readinessPanel && <section className="citation-panel citation-pad"><div className="brand-score-kv"><span>已取得回答</span><b>{run.coverage.responses ?? '待核对'}</b></div><div className="brand-score-kv"><span>分析字符覆盖</span><b>{run.coverage.analyzed_characters ?? 0} / {run.coverage.total_characters ?? 0}</b></div><div className="brand-score-kv"><span>来源正文归档</span><b>{run.coverage.captured_sources ?? 0} / {run.coverage.sources ?? 0}</b></div><p className="citation-muted">正文保存不代表全文完整，来源诊断与回答评分分别核对。</p></section>}
    {mode === 'brands' && <section className="citation-panel citation-pad">
      <div className="citation-section-head"><div><h2>品牌能力轮廓</h2><p className="citation-muted">同一问题范围的四维评分，0–100 分；总分按固定权重计算。</p></div>
        <div className="brand-chart-controls"><label>平台<select aria-label="雷达图平台" value={platform || ''} onChange={event => setPlatform(event.target.value)}><option value="all">审计整体</option>{platforms.map(name => <option key={name} value={name}>{getAiPlatformLabel(name)}</option>)}</select></label>
          <label>对比品牌<select aria-label="雷达图对比品牌" value={comparison?.id || ''} onChange={event => setComparisonId(event.target.value)}><option value="" disabled>暂无确认品牌</option>{candidates.map(entity => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label></div></div>
      <div className="brand-chart-layout"><div><div className="brand-chart-legend">{rows.map((entity, index) => <span key={entity.id}><i style={{ background: index ? '#a99bff' : '#00c9a0' }} />{entity.name}{index ? ' · 虚线' : ' · 自有品牌'}</span>)}</div>
        {!own && <p className="citation-muted">请先确认自有品牌身份，再查看品牌间图形对照。</p>}
        <svg viewBox="0 0 380 340" role="img" aria-label="品牌四维评分雷达图" className="brand-radar">
          <title>同一问题范围品牌分项对比，未知项不绘制为零</title>
          {[25, 50, 75, 100].map(value => <g key={value}><polygon points={points([value, value, value, value])} fill="none" stroke="#30394b" /><text x="196" y={166 - value} fill="#8f9ab2" fontSize="10">{value}</text></g>)}
          {dimensions.map(([, label], index) => { const [x, y] = point(100, index); return <line key={label} x1="190" y1="170" x2={x} y2={y} stroke="#30394b" />; })}
          <g fill="currentColor" fontSize="12"><text x="190" y="42" textAnchor="middle">品牌出现</text><text x="374" y="174" textAnchor="end">推荐强度</text><text x="190" y="300" textAnchor="middle">推荐位置</text><text x="6" y="174">选择理由</text></g>
          {rows.map((entity, series) => { const values = dimensions.map(([key]) => scopeRow(entity.id)?.dimensions[key]?.score ?? null); const complete = values.every((value): value is number => value !== null); const color = series ? '#a99bff' : '#00c9a0'; return <g key={entity.id}>
            {complete && <polygon points={points(values as number[])} fill={color} fillOpacity=".08" stroke={color} strokeWidth="2" strokeDasharray={series ? '6 4' : undefined} />}
            {values.map((value, index) => { if (value === null) return null; const [x, y] = point(value, index); return <circle key={index} cx={x} cy={y} r="4" fill={color}><title>{entity.name} · {dimensions[index][1]}：{value} 分</title></circle>; })}</g>; })}
        </svg></div><div className="brand-chart-reading"><h3>先看差距，再核对证据</h3><p>未确认问题范围、身份或分项证据不足时，对应数据保持未知。缺失轴不绘点，也不闭合轮廓。</p>
          {dimensions.map(([key, label]) => <div className="brand-score-kv" key={key}><span>{label}</span><span>{display(scopeRow(own?.id)?.dimensions[key]?.score)} / {display(scopeRow(comparison?.id)?.dimensions[key]?.score)}</span></div>)}<small>左侧为自有品牌，右侧为对比品牌。图形面积不用于计算总分。</small></div></div>
    </section>}
    {mode === 'brands' && <section className="citation-panel citation-pad"><h2>品牌评分 · 同一规则与问题范围</h2><p className="citation-muted">关注品牌即使本次未提及仍保留一行；来源发现与回答观察分开计数。</p><div className="brand-score-table"><table><thead><tr><th>品牌</th>{dimensions.map(([key, label], index) => <th key={key}>{label} {[30, 30, 20, 20][index]}%</th>)}<th>本次总分</th><th>评分覆盖权重</th><th>依据</th></tr></thead><tbody>{brands.map(entity => { const score = scoreFor(entity.id); return <tr key={entity.id}><td><b>{entity.name}</b>{presence && <small>{(() => { const count = presence.targets.find(target => target.target_id === entity.id)?.presence_counts; return !count || !Object.values(count).some(Boolean) ? "回答观察尚未开始" : `回答已观察 ${count?.present || 0} · 完整分析未提及 ${count?.observed_absent || 0} · 未知 ${count?.unknown || 0}`; })()}</small>}<small>{entity.role === 'own' ? '自有品牌' : entity.role === 'competitor' ? '已登记竞品' : '发现实体'} · {entity.identity_status === 'confirmed' ? '身份已确认' : '身份待确认'}</small></td>{dimensions.map(([key]) => <td key={key}>{display(scopeRow(entity.id, "all")?.dimensions[key]?.score)}</td>)}<td>{display(score?.score)}</td><td>{score ? `${Math.round(score.covered_weight * 100)}%` : '待分析'}</td><td><details><summary>查看评分依据</summary><p>品牌出现 30% · 推荐强度 30% · 推荐位置 20% · 选择理由 20%。</p>{evidenceRows(entity.id).map(row => <div key={row.response_id || row.platform} className="brand-score-evidence"><AiPlatformLabel platform={row.platform} /><span>{dimensions.map(([key, label]) => `${label} ${display(row.dimensions[key])}`).join(' · ')}</span>{onEvidence && row.response_id && <button type="button" onClick={() => onEvidence(row.response_id!)}>查看回答原文 →</button>}</div>)}</details></td></tr>; })}</tbody></table></div><p className="citation-muted">{!brands.length && "当前尚无完成分析的品牌实体，身份确认和评分依据待补齐。"}未取得完整评分时保留“—”，不会重新分配缺失数据的权重。</p></section>}
    {mode === 'platforms' && <section className="citation-panel citation-pad"><h2>差距出现在哪个平台？</h2><div className="brand-chart-legend">{rows.map((entity, index) => <span key={entity.id}><i style={{ background: index ? '#a99bff' : '#00c9a0' }} />{entity.name}</span>)}</div>
      <div className="brand-bar-axis"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
      {platforms.map(name => <div className="brand-platform-bars" key={name}><button type="button" aria-label={`查看${getAiPlatformLabel(name)}的平台分析`} onClick={() => onPlatformSelect?.(name)}><AiPlatformLabel platform={name} /></button><div>{!rows.length && <div className="brand-bar-track"><span>品牌评分待分析</span></div>}{rows.map((entity, index) => { const score = scopeRow(entity.id, name)?.total.score; return <div key={entity.id} className="brand-bar-track" aria-label={`${entity.name}：${display(score)} 分`}>{score == null ? <span>待分析</span> : <><span style={{ width: `${score}%`, background: index ? '#a99bff' : '#00c9a0' }} /><b>{score}</b></>}</div>; })}</div></div>)}
      {!platforms.length && <p className="citation-muted">暂无平台评分数据。</p>}</section>}
    {mode === 'overview' && <section className="citation-panel citation-pad"><h2>本次观察到的竞争差距</h2>{evaluation.comparison?.gaps.slice(0, 3).map(gap => <details className="brand-gap" key={gap.id}><summary><AiPlatformLabel platform={gap.platform} /> {gap.finding}</summary><p>{gap.action.task}</p><p>验收：{gap.action.acceptance}</p><p>复测：{gap.action.retest.success_check}</p>{gap.response_ids.map(id => onEvidence && <button key={id} type="button" onClick={() => onEvidence(id)}>查看支撑回答 →</button>)}</details>)}{!evaluation.comparison?.gaps.length && <p className="citation-muted">尚无满足同范围、完整证据要求的竞争差距。</p>}</section>}
  </div>;
}
