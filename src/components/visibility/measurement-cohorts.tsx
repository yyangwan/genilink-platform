"use client";

import { useEffect, useRef, useState } from 'react';
import { PresenceMetrics, type PresenceMetric } from './presence-metrics';
import type { EvidenceRun, EvidenceRunListItem } from '@/types/intelligence';
import { getAiPlatformLabel } from '@/lib/ai-platforms';

type Cohort = { id: string; title: string; baseline_run_id: string; expected_samples: number; platforms: string[]; entities: Array<{ id: string; name: string; identity_status: string }> };
type Retest = { id: string; audit_id: string; capture_status: string; published_run_id: string | null };
type Result = { id: string; baseline_run_id: string; followup_run_id: string; entities: Cohort['entities']; platforms: Array<{ platform: string; status: string; expected_samples: number; prompt_clusters: number;
  included: Array<{ baseline_sample_id: string }>; excluded: Array<{ baseline_sample_id: string; sample_index: number; reason: string }>; out_of_cohort: Array<{ response_id: string }>;
  source_populations?: Record<string, Partial<PresenceMetric>>; metrics: PresenceMetric[] }> };

const reasons: Record<string, string> = { missing_baseline: '基线未取得回答', missing_followup: '复测未取得对应回答', ambiguous_sample: '样本对应不唯一', incomplete_answer: '回答采集不完整', incomplete_analysis: '回答尚未全部分析', ambiguous_identity: '同名片段归属待核对', unknown_conditions: '实际采集条件未知', conditions_changed: '实际采集条件变化', observation_not_later: '复测时间不晚于基线', prompt_version_changed: '提示词版本变化', analysis_signature_changed: '分析口径变化', entity_mapping_changed: '实体映射变化', insufficient_rounds: '共同独立轮次不足' };
const statuses: Record<string, string> = { valid_comparison: '可作观测对比', insufficient: '共同样本不足', descriptive_only: '仅可描述', undetermined: '无法判断', running: '采集中', completed: '采集完成', partial: '部分完成', failed: '采集失败', pending: '等待采集' };

const cls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm';

export function MeasurementCohorts({ run, runs, projectId, onCaptureStarted, onOpenEvidence }: { run: EvidenceRun; runs: EvidenceRunListItem[]; projectId: string; onCaptureStarted: (auditId: string) => void; onOpenEvidence?: (runId: string, kind: string, id: string) => void }) {
  const [cohorts, setCohorts] = useState<Cohort[]>([]), [selected, setSelected] = useState('');
  const [entityIds, setEntityIds] = useState<string[]>([]), [title, setTitle] = useState('');
  const [followup, setFollowup] = useState(''), [retests, setRetests] = useState<Retest[]>([]), [results, setResults] = useState<Result[]>([]);
  const [loadedCohort, setLoadedCohort] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const pending = useRef<{ payload: string; key: string } | null>(null);
  const cohort = cohorts.find(item => item.id === selected);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'cohorts' })}`, { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '复测方案读取失败'); return data;
    }).then(data => { if (!controller.signal.aborted) { setCohorts(data.cohorts); setSelected(old => old || data.cohorts[0]?.id || ''); } }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [projectId, refresh]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    Promise.all(['retests', 'measurementResults'].map(view => fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view, cohortId: selected })}`, { signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '复测结果读取失败'); return data;
    }))).then(([tasks, measured]) => { if (!controller.signal.aborted) { setRetests(tasks.retests); setResults(measured.results); setLoadedCohort(selected); } }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [projectId, selected, refresh]);
  const submit = async (action: 'createCohort' | 'startRetest' | 'compareCohort') => {
    const payload = action === 'createCohort' ? { action, baselineRunId: run.id, title, entityIds } : action === 'compareCohort' ? { action, cohortId: selected, followupRunId: followup } : { action, cohortId: selected };
    const key = JSON.stringify(payload); if (pending.current?.payload !== key) pending.current = { payload: key, key: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...payload, idempotencyKey: pending.current.key }) });
      const data = await response.json(); if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(data.error || '复测操作失败'); }
      pending.current = null;
      if (action === 'createCohort') { setSelected(data.id); setFollowup(''); setMessage('基线问题版本、平台与独立轮次已冻结。'); }
      else if (action === 'startRetest') { onCaptureStarted(data.audit_id); setMessage('固定样本复测已受理，完成分析后可计算对比。'); }
      else setMessage('观测对比已保存；不代表内容行动造成了变化。');
      setRefresh(value => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作失败'); } finally { setBusy(false); }
  };
  return <section className="space-y-5">
    <p className="text-sm text-[var(--text-secondary)]">冻结当前基线，分别复测各平台。分别衡量回答提及、实际引用卡片、已保存引用正文与检索候选卡片提及，各指标使用自己的有效样本。有效比较至少需要20个共同问题、每题3轮，并核对实际采集条件与分析口径。</p>
    <div className="dashboard-surface space-y-3 p-5"><h3 className="font-semibold">从当前分析创建固定复测方案</h3>
      <input aria-label="复测方案名称" value={title} disabled={busy} maxLength={200} onChange={event => setTitle(event.target.value)} placeholder="复测方案名称（至少5字）" className={`${cls} w-full`} />
      <div className="grid gap-2 md:grid-cols-2">{(run.summary.entities || []).map(entity => <label key={entity.id} className="text-sm"><input type="checkbox" checked={entityIds.includes(entity.id)} disabled={busy} onChange={event => setEntityIds(old => event.target.checked ? [...old, entity.id] : old.filter(id => id !== entity.id))} /> {entity.name} · {entity.identity_status === 'confirmed' ? '已确认身份' : '候选实体'}</label>)}</div>
      <button disabled={busy || title.trim().length < 5 || !entityIds.length || entityIds.length > 20 || !['ready', 'partial'].includes(run.status)} onClick={() => submit('createCohort')} className={`${cls} disabled:opacity-40`}>冻结基线与实体名单</button>
    </div>
    {message && <p role="status" className="text-sm">{message}</p>}
    <div className="flex flex-wrap gap-3"><select aria-label="固定复测方案" value={selected} disabled={busy} onChange={event => { setSelected(event.target.value); setFollowup(''); }} className={cls}><option value="">选择复测方案</option>{cohorts.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
      <button disabled={busy} onClick={() => setRefresh(old => old + 1)} className={cls}>刷新复测状态</button>
      <button disabled={busy || !cohort} onClick={() => submit('startRetest')} className={`${cls} disabled:opacity-40`}>发起固定样本复测（1次审计额度）</button></div>
    {cohort && <p className="text-sm">固定样本：{cohort.expected_samples}轮回答 · {cohort.platforms.map(getAiPlatformLabel).join('、')} · 原提示词后续修改不会改变本方案。</p>}
    {(loadedCohort === selected ? retests : []).map(task => <p key={task.id} className="text-sm">复测审计 {task.audit_id} · {statuses[task.capture_status] || '待确认'} · {task.published_run_id ? '分析结果可用' : '等待分析结果'}</p>)}
    {cohort && <div className="flex flex-wrap gap-3"><select aria-label="复测分析结果" value={followup} disabled={busy} onChange={event => setFollowup(event.target.value)} className={cls}><option value="">选择复测后的已发布分析</option>{runs.filter(item => item.id !== cohort.baseline_run_id && ['ready', 'partial'].includes(item.status)).map(item => <option key={item.id} value={item.id}>审计 {item.audit_id} · 修订 {item.revision}</option>)}</select><button disabled={busy || !followup} onClick={() => submit('compareCohort')} className={`${cls} disabled:opacity-40`}>计算并保存观测对比</button></div>}
    {(loadedCohort === selected ? results : []).map(result => <div key={result.id} className="space-y-4">{result.platforms.map(platform => <section key={platform.platform} className="dashboard-surface space-y-3 p-5">
      <h3 className="font-semibold">{getAiPlatformLabel(platform.platform)} · {statuses[platform.status] || '待确认'}</h3>
      <p className="text-sm text-[var(--text-secondary)]">共同有效回答 {platform.included.length}/{platform.expected_samples} · 问题簇 {platform.prompt_clusters} · 排除 {platform.excluded.length} · 额外样本 {platform.out_of_cohort.length}</p>
      <PresenceMetrics metrics={platform.metrics.map(metric => ({ ...platform.source_populations?.[metric.metric], ...metric }))} platformStatus={platform.status} entities={result.entities} runIds={{ baseline: result.baseline_run_id, followup: result.followup_run_id }} onOpen={onOpenEvidence} />
      {platform.excluded.length > 0 && <details className="text-sm"><summary>查看样本排除原因</summary><ul className="mt-2 space-y-1">{platform.excluded.map(item => <li key={item.baseline_sample_id}>第{item.sample_index}轮 · {reasons[item.reason] || '条件无法核对'} · 样本 {item.baseline_sample_id}</li>)}</ul></details>}
      <p className="text-sm text-[var(--text-secondary)]">正文指标只描述完整分析过的已保存文本，不保证原文章全文完整，也不证明模型采用了某段内容。候选来源不作为实际引用。区间为探索性单项区间，未做多重比较校正。这些数据只说明观测变化。平台自身更新、其他内容与时间变化仍可能影响结果；点击、转化与ROI尚无数据。</p>
    </section>)}</div>)}
  </section>;
}
