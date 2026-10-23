"use client";

import { useState } from 'react';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import type { BrandScoreDimension, EvidenceRun } from '@/types/intelligence';
import './brand-score-workspace.css';

const dimensions: Array<[BrandScoreDimension, string]> = [
  ['presence', '品牌出现'], ['recommendation', '推荐强度'], ['position', '推荐位置'], ['reasons', '选择理由'],
];
const display = (score: number | null | undefined) => typeof score === 'number' && Number.isFinite(score) ? String(score) : '—';

export function BrandScoreWorkspace({ run, mode = 'brands', onEvidence, onPlatformSelect }: {
  run: EvidenceRun; mode?: 'brands' | 'overview' | 'platforms'; onEvidence?: (responseId: string) => void; onPlatformSelect?: (platform: string) => void;
}) {
  const evaluation = run.summary.brand_evaluation;
  const brands = (run.summary.entities || []).filter(entity => ['brand', 'organization', 'product'].includes(entity.kind));
  const own = brands.find(entity => entity.role === 'own' && entity.identity_status === 'confirmed');
  const candidates = brands.filter(entity => entity.id !== own?.id && entity.identity_status === 'confirmed');
  const [comparisonId, setComparisonId] = useState('');
  const comparison = candidates.find(entity => entity.id === comparisonId) || candidates[0];
  const platforms = Array.from(new Set(evaluation?.comparison?.scope_scores.filter(row => row.axis === 'platform').map(row => String(row.scope)) || []));
  const [platformValue, setPlatform] = useState('all');
  const platform = platformValue === 'all' || platforms.includes(platformValue) ? platformValue : 'all';
  const scopeRow = (entityId: string | undefined, name = platform) => evaluation?.comparison?.scope_scores.find(row => row.axis === (name === 'all' ? 'overall' : 'platform') && row.scope === name && row.entity_id === entityId);
  const ownScore = evaluation?.brand_scores.find(row => row.entity_id === own?.id);
  const rows = (own ? [own, comparison] : []).filter((entity): entity is NonNullable<typeof entity> => !!entity);
  const point = (value: number, index: number) => [190 + Math.sin(index * Math.PI / 2) * value, 170 - Math.cos(index * Math.PI / 2) * value];
  const points = (values: number[]) => values.map((value, index) => point(value, index).join(',')).join(' ');
  if (!evaluation) return <section className="citation-panel citation-pad"><h2>品牌固定评价</h2><p className="citation-muted">当前修订尚无固定规则评分。需完成评分分析后查看，不使用情绪率代替总分。</p></section>;
  return <div className="brand-score-workspace">
    {mode === 'overview' && <section className="citation-panel citation-pad brand-score-conclusion">
      <div><span className="citation-muted">本次品牌评价 · 固定规则 v1</span><h2>{own?.name || '自有品牌身份待确认'}</h2>
        <p>{ownScore?.score != null ? '本次结果已具备完整评分依据，可逐平台核查竞争差距。' : '评分依据尚不完整，暂不发布品牌总分。'}</p>
        <small>本次审计快照 · 未采集、未分析与未知不计为零分</small></div>
      <strong>{display(ownScore?.score)}<small>/ 100</small></strong>
    </section>}
    {mode === 'overview' && <section className="citation-panel citation-pad"><div className="brand-score-kv"><span>已取得回答</span><b>{run.coverage.responses ?? '待核对'}</b></div><div className="brand-score-kv"><span>分析字符覆盖</span><b>{run.coverage.analyzed_characters ?? 0} / {run.coverage.total_characters ?? 0}</b></div><div className="brand-score-kv"><span>来源正文归档</span><b>{run.coverage.captured_sources ?? 0} / {run.coverage.sources ?? 0}</b></div><p className="citation-muted">正文保存不代表全文完整，来源诊断与回答评分分别核对。</p></section>}
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
    {mode !== 'platforms' && <section className="citation-panel citation-pad"><h2>品牌评分 · 同一规则与问题范围</h2><div className="brand-score-table"><table><thead><tr><th>品牌</th>{dimensions.map(([key, label], index) => <th key={key}>{label} {[30, 30, 20, 20][index]}%</th>)}<th>本次总分</th><th>评分覆盖权重</th><th>依据</th></tr></thead><tbody>{brands.map(entity => { const score = evaluation.brand_scores.find(item => item.entity_id === entity.id); return <tr key={entity.id}><td><b>{entity.name}</b><small>{entity.role === 'own' ? '自有品牌' : entity.role === 'competitor' ? '已登记竞品' : '发现实体'} · {entity.identity_status === 'confirmed' ? '身份已确认' : '身份待确认'}</small></td>{dimensions.map(([key]) => <td key={key}>{display(scopeRow(entity.id, "all")?.dimensions[key]?.score)}</td>)}<td>{display(score?.score)}</td><td>{score ? `${Math.round(score.covered_weight * 100)}%` : '待分析'}</td><td><details><summary>查看评分依据</summary><p>品牌出现 30% · 推荐强度 30% · 推荐位置 20% · 选择理由 20%。</p>{evaluation.answer_scores.filter(row => row.entity_id === entity.id).map(row => <div key={row.response_id} className="brand-score-evidence"><AiPlatformLabel platform={row.platform} /><span>{dimensions.map(([key, label]) => `${label} ${display(row.dimensions[key])}`).join(' · ')}</span>{onEvidence && <button type="button" onClick={() => onEvidence(row.response_id)}>查看回答原文 →</button>}</div>)}</details></td></tr>; })}</tbody></table></div><p className="citation-muted">未取得完整评分时保留“—”，不会重新分配缺失数据的权重。</p></section>}
    {mode === 'platforms' && <section className="citation-panel citation-pad"><h2>差距出现在哪个平台？</h2><div className="brand-chart-legend">{rows.map((entity, index) => <span key={entity.id}><i style={{ background: index ? '#a99bff' : '#00c9a0' }} />{entity.name}</span>)}</div>
      <div className="brand-bar-axis"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
      {platforms.map(name => <div className="brand-platform-bars" key={name}><button type="button" aria-label={`查看${getAiPlatformLabel(name)}的平台分析`} onClick={() => onPlatformSelect?.(name)}><AiPlatformLabel platform={name} /></button><div>{rows.map((entity, index) => { const score = scopeRow(entity.id, name)?.total.score; return <div key={entity.id} className="brand-bar-track" aria-label={`${entity.name}：${display(score)} 分`}>{score == null ? <span>待分析</span> : <><span style={{ width: `${score}%`, background: index ? '#a99bff' : '#00c9a0' }} /><b>{score}</b></>}</div>; })}</div></div>)}
      {!platforms.length && <p className="citation-muted">暂无平台评分数据。</p>}</section>}
    {mode === 'overview' && <section className="citation-panel citation-pad"><h2>本次观察到的竞争差距</h2>{evaluation.comparison?.gaps.slice(0, 3).map(gap => <details className="brand-gap" key={gap.id}><summary><AiPlatformLabel platform={gap.platform} /> {gap.finding}</summary><p>{gap.action.task}</p><p>验收：{gap.action.acceptance}</p><p>复测：{gap.action.retest.success_check}</p>{gap.response_ids.map(id => onEvidence && <button key={id} type="button" onClick={() => onEvidence(id)}>查看支撑回答 →</button>)}</details>)}{!evaluation.comparison?.gaps.length && <p className="citation-muted">尚无满足同范围、完整证据要求的竞争差距。</p>}</section>}
  </div>;
}
