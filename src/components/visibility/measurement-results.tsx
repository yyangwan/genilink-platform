"use client";
import { useState } from 'react';
import Link from 'next/link';
import type { MeasurementHistory } from '@/types/measurement-history';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { PresenceMetrics } from './presence-metrics';
import { SavedContent } from './saved-content';

const statuses: Record<string, string> = { valid_comparison: '可作观测对比', insufficient: '共同样本不足', descriptive_only: '仅可描述', undetermined: '无法判断' };
const reasons: Record<string, string> = { missing_baseline: '基线未取得回答', missing_followup: '复测未取得对应回答', ambiguous_sample: '样本对应不唯一', incomplete_answer: '回答采集不完整', incomplete_analysis: '回答尚未全部分析', ambiguous_identity: '同名片段归属待核对', unknown_conditions: '实际采集条件未知', conditions_changed: '实际采集条件变化', observation_not_later: '复测时间不晚于基线', prompt_version_changed: '提示词版本变化', analysis_signature_changed: '分析口径变化', entity_mapping_changed: '实体映射变化', insufficient_rounds: '共同独立轮次不足' };

export function MeasurementResults({ data, projectId, platformFilter }: { data: Pick<MeasurementHistory, 'results' | 'context_sync_pending'>; projectId: string; platformFilter?: string }) {
  const [selectedPlatform, setPlatform] = useState('');
  const platform = platformFilter ?? selectedPlatform;
  const [owner, setOwner] = useState<{ runId: string; kind: string; id: string } | null>(null);
  const platforms = Array.from(new Set(data.results.flatMap(item => item.platforms.map(row => row.platform))));
  return <div className="space-y-5">
    {data.context_sync_pending && <p role="status">品牌配置待同步；以下记录仅供历史回查，不作为当前效果结论。</p>}
    {!data.results.length ? <p className="dashboard-surface p-5">本方案尚无已保存的观测对比。需先在证据分析中完成固定样本复测、分析和对比计算；本页不会自动采集或计算。</p> : <>
      {platformFilter === undefined && <label className="block text-sm">复测平台 <select aria-label="复测平台" value={platform} onChange={event => setPlatform(event.target.value)} className="dashboard-input ml-2 p-2"><option value="">全部平台</option>{platforms.map(value => <option key={value} value={value}>{getAiPlatformLabel(value)}</option>)}</select></label>}
      {data.results.map(result => <article key={result.id} className="dashboard-surface space-y-4 p-5" aria-label={`复测记录 ${result.id}`}>
        <h2 className="font-semibold">基线审计 #{result.baseline_audit_id} → 复测审计 #{result.followup_audit_id}</h2>
        {result.report_role && <p className="text-sm">本报告对应{result.report_role === 'baseline' ? '基线' : '复测'}修订 · {result.cohort_title || '固定样本方案'}</p>}
        <p className="break-all text-xs">记录时间 {result.created_at} · 基线修订 {result.baseline_run_id} · 复测修订 {result.followup_run_id}</p>
        {!result.snapshot_current && <p role="status" className="text-sm text-[var(--color-warning)]">分析修订、配置或口径已变化，本记录仅供历史回查；不输出当前变化结论。请完成新修订的固定样本对比。</p>}
        <div className="flex flex-wrap gap-4 text-sm"><Link href={`/audits/${result.baseline_audit_id}/report?project=${encodeURIComponent(projectId)}`}>查看基线审计当前报告</Link><Link href={`/audits/${result.followup_audit_id}/report?project=${encodeURIComponent(projectId)}`}>查看复测审计当前报告</Link></div>
        {result.platforms.filter(item => !platform || item.platform === platform).map(row => <section key={row.platform} className="space-y-3 border-t border-[var(--border)] pt-3"><h3 className="font-semibold">{getAiPlatformLabel(row.platform)} · 计算时状态：{statuses[row.status] || '待核对'}</h3>
          <p className="text-sm">回答共同有效 {row.included.length}/{row.expected_samples} · 共同问题簇 {row.prompt_clusters} · 排除 {row.excluded.length} · 额外样本 {row.out_of_cohort.length}</p>
          <PresenceMetrics metrics={row.metrics.map(metric => ({ ...row.source_populations?.[metric.metric], ...metric, ...(!result.snapshot_current ? { difference: null, interval95: null } : {}) }))} platformStatus={row.status} entities={result.entities} runIds={{ baseline: result.baseline_run_id, followup: result.followup_run_id }} onOpen={(runId, kind, id) => setOwner({ runId, kind, id })} />
          {!!row.excluded.length && <details className="text-xs"><summary>回答共同样本排除记录</summary>{row.excluded.map(item => <p key={item.baseline_sample_id}>样本 {item.baseline_sample_id} · 第 {item.sample_index} 轮 · {reasons[item.reason] || '条件或完整性尚不满足比较要求'}</p>)}</details>}
        </section>)}
      </article>)}
    </>}
    {owner && <SavedContent key={`${owner.runId}-${owner.kind}-${owner.id}`} projectId={projectId} runId={owner.runId} kind={owner.kind} id={owner.id} close={() => setOwner(null)} />}
  </div>;
}
