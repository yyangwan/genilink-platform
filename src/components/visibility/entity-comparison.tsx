"use client";

import { useState } from 'react';
import type { CitationReport } from '@/types/citation-report';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { sourceReasons } from './presence-metrics';

const outcomes = [
  { id: 'answer_presence', label: '回答提及' },
  { id: 'cited_card_presence', label: '实际引用卡片' },
  { id: 'cited_archive_presence', label: '已存引用正文' },
  { id: 'candidate_card_presence', label: '检索候选卡片' },
];
const roles: Record<string, string> = { own: '自有品牌', competitor: '已登记竞品', comparison: '仅用于对比', unregistered: '未登记主体' };
const reasons: Record<string, string> = { ...sourceReasons, incomplete_answer: '回答未完整采集', ambiguous_identity: '实体归属待核对', analysis_incomplete: '分析未完成' };

export function EntityComparison({ report, platform, onEntity }: { report: CitationReport; platform: string; onEntity: (id: string) => void }) {
  const [referenceId, setReferenceId] = useState('');
  const entities = report.entities || [];
  const reference = entities.find(item => item.id === referenceId);
  return <section className="dashboard-surface space-y-4 p-5" aria-label="全部实体同审计对比">
    <h2 className="font-semibold">全部实体同审计对比</h2>
    <p className="text-sm">包含本次观察到的未登记主体。同平台、同指标使用相同有效回答；差距为本次样本描述，不是排名、跨平台胜负或优化效果。不同指标不可合并成总分。</p>
    <label className="block text-sm">对照实体 <select aria-label="对照实体" value={referenceId} onChange={event => setReferenceId(event.target.value)} className="dashboard-input ml-2 p-2"><option value="">仅查看各实体提及率</option>{entities.map(item => <option key={item.id} value={item.id}>{item.name} · {item.id.slice(0, 8)}</option>)}</select></label>
    {(report.platforms || []).filter(row => !platform || row.platform === platform).map(row => <article key={row.platform} className="space-y-3 border-t border-[var(--border)] pt-3">
      <h3 className="font-semibold">{getAiPlatformLabel(row.platform)} · {row.samples} 次回答样本</h3>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>实体 / 冻结身份</th>{outcomes.map(metric => <th key={metric.id}>{metric.label}{reference && <p className="font-normal">相对 {reference.name}</p>}</th>)}</tr></thead><tbody>{entities.map(entity => <tr key={entity.id} className="border-t border-[var(--border)]"><td className="py-3"><button className="text-[var(--color-primary)]" onClick={() => onEntity(entity.id)}>{entity.name}</button><p className="text-xs">{roles[entity.role] || '未登记主体'} · {entity.identity_status === 'confirmed' ? '身份已确认' : '身份待核对'}{entity.role_conflict ? ' · 角色冲突待核对' : ''} · {entity.id.slice(0, 8)}</p></td>{outcomes.map(metric => {
        const population = row.metrics.find(item => item.metric === metric.id);
        const value = population?.entities.find(item => item.entity_id === entity.id);
        const baseline = population?.entities.find(item => item.entity_id === referenceId);
        const comparable = !!value?.denominator && !!baseline?.denominator && value.denominator === baseline.denominator;
        const delta = comparable ? (value!.numerator / value!.denominator - baseline!.numerator / baseline!.denominator) * 100 : null;
        return <td key={metric.id}>{value?.denominator ? `${value.numerator}/${value.denominator}（${(value.numerator / value.denominator * 100).toFixed(1)}%）` : '未知（无有效样本）'}{reference && <p className="text-xs">{delta === null ? '不计算差距' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} 个百分点`}</p>}</td>;
      })}</tr>)}</tbody></table></div>
      {row.metrics.map(metric => <details key={metric.metric} className="text-xs"><summary>{outcomes.find(item => item.id === metric.metric)?.label || metric.metric} · 有效 {metric.included.length} / 排除 {metric.excluded.length}</summary>{metric.excluded.map(item => <p key={item.response_id}>{item.response_id} · {reasons[item.reason] || '条件待核对'}</p>)}</details>)}
    </article>)}
    {!entities.length && <p>当前快照没有可展示的观察实体，不补造品牌或提及次数。</p>}
  </section>;
}
