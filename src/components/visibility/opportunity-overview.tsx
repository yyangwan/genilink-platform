"use client";

import { useEffect, useState } from 'react';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { analysisTargets, originalOpportunityScope, readPriority, scopeIssues } from '@/lib/visibility/analysis-scope';
import { loadOpportunities, type OpportunityCollection } from '@/lib/visibility/opportunity-reader';
import { matchesOpportunity, setTaskScope, taskStates, type TaskScope } from '@/lib/visibility/task-view';
import type { TaskOpportunity } from '@/lib/visibility/task-contract';
import type { EvidenceRun } from '@/types/intelligence';
import { EvidenceCard, EvidenceReading, OpportunityEvidence, type EvidenceReadTarget } from './task-details';
import './task-workspace.css';

function useOpportunities(projectId: string, runId: string, priority: 'frozen' | 'current') {
  const [refresh, setRefresh] = useState(0), [value, setValue] = useState<{ key: string; page?: OpportunityCollection; error?: string } | null>(null);
  const key = `${projectId}:${runId}:${priority}:${refresh}`;
  useEffect(() => {
    const abort = new AbortController();
    loadOpportunities(projectId, runId, priority, abort.signal).then(page => { if (!abort.signal.aborted) setValue({ key, page }); })
      .catch(error => { if (!abort.signal.aborted) setValue({ key, error: error.message }); });
    return () => abort.abort();
  }, [projectId, runId, priority, key]);
  return { page: value?.key === key ? value.page : undefined, error: value?.key === key ? value.error : undefined, retry: () => setRefresh(value => value + 1) };
}

export function OpportunityOverview({ run, projectId, scope, search, onPreferences }: { run: EvidenceRun; projectId: string; scope: TaskScope; search: string; onPreferences: () => void }) {
  const priority = readPriority(projectId, search), { page, error, retry } = useOpportunities(projectId, run.id, priority);
  const invalid = scopeIssues(run, scope).length > 0;
  const rows = (page?.items || []).filter(row => matchesOpportunity(row, scope));
  const names = analysisTargets(run);
  return <section className="citation-panel citation-pad opportunity-overview" aria-label="本次优化机会">
    <div className="citation-section-head"><div><h2>本次值得优先处理的事项</h2><p className="citation-muted">按已保存的观察形成任务，原因解释、待准备材料与审核状态分别保留。</p></div><button type="button" className="dashboard-button dashboard-button--secondary" onClick={onPreferences}>设置场景重要性</button></div>
    <div className="task-priority-choice"><label>机会排序<select aria-label="机会排序" value={priority} onChange={event => setTaskScope(projectId, {}, { priority: event.target.value })}><option value="frozen">本次审计冻结排序</option><option value="current">按当前业务偏好预览</option></select></label><p className="citation-muted">{priority === 'current' ? '只读排序预览，不重采、不重分析，不改写原任务和批准。' : '冻结排序保留本次使用的业务偏好与证据条件。'} 策略版本：{page?.policy?.version || '待读取'}。</p></div>
    {error ? <div role="alert" className="citation-notice citation-notice--warning">{error}<button type="button" onClick={retry}>重新读取 →</button></div> : !page ? <p role="status">正在读取完整机会与排序依据…</p> : <>
      {(!page.version || page.status !== 'evaluated' || !!page.deferred_task_count || !!Object.keys(page.deferred_candidates || {}).length) && <p className="citation-notice citation-notice--warning">{!page.version ? '本次尚未生成可读取的机会分析。' : '本次分析仍有未知或延后处理范围，未发现不能解释为没有优化空间。'}{page.deferred_task_count ? ` ${page.deferred_task_count} 项任务延后处理。` : ''}</p>}
      {page.registry_context_changed && <p className="citation-notice citation-notice--warning">当前品牌配置已变化，预览排序仍沿用本次冻结观察，请先核对身份与分析版本。</p>}
      {invalid ? <p className="citation-muted">原比较范围已失效，请先在上方明确重选；没有套用其他品牌的机会。</p> : !scope.own ? <p className="citation-muted">先选择自有品牌，再核对对应的竞争机会与材料需求。</p> : <>
        <div className="opportunity-cards">{rows.slice(0, 3).map(row => <article className="citation-panel citation-pad task-card" key={row.id}><div className="task-chip-row"><span className="citation-tag">{taskStates[row.actionability]}</span><span className="citation-muted">{row.priority?.rank ? `本次排序 ${row.priority.rank}` : '排序待核对'}</span></div>
          <h3>{row.task_pack?.deliverable || row.finding}</h3><div className="task-chip-row"><span>{names.find(target => target.target_id === row.own_target_id)?.name || '冻结品牌目标'}</span>{row.platforms.map(name => <AiPlatformLabel key={name} platform={name} />)}</div>
          <p className="task-observed"><b>本次观察</b>{row.finding}</p>
          <p className="task-material">我方材料：{row.task_pack?.missing_materials.length ? row.task_pack.missing_materials.join('；') : row.actionability === 'ready_for_review' ? '已有核对候选，仍需审核适用范围。' : '先核对身份、适用范围与材料。'}</p>
          <div className="task-meta">{row.task_pack ? `${row.task_pack.delivery.asset_title} · ${row.task_pack.ai_targets.length} 个平台场景目标` : '任务包未就绪，先核对适用范围与材料。'}</div>
          <p className="citation-muted">原因仍需核实，竞品内容不能直接成为我方事实。</p>
          <div className="citation-inline-actions"><button type="button" onClick={() => enterOpportunity(projectId, run, row, 'evidence')}>核对这项机会的证据 →</button><button type="button" onClick={() => enterOpportunity(projectId, run, row, 'actions')}>查看具体任务 →</button></div>
        </article>)}</div>
        {!rows.length && <p className="citation-empty">本次已处理材料中没有匹配当前范围的机会；未知或未处理内容不计作没有能力。</p>}
        {!!rows.length && <p className="citation-muted">当前范围共 {rows.length} 项，展示排序最前 {Math.min(3, rows.length)} 项；完整任务始终保留全部平台子目标、原问题和反向证据。</p>}
      </>}
    </>}
    <div className="citation-inline-actions"><button type="button" onClick={() => setTaskScope(projectId, {}, { view: 'actions', runId: run.id, auditId: run.audit_id })}>查看全部优化行动 →</button><button type="button" onClick={() => setTaskScope(projectId, {}, { view: 'platforms', runId: run.id, auditId: run.audit_id })}>按平台核对差异 →</button></div>
  </section>;
}
function enterOpportunity(projectId: string, run: EvidenceRun, row: TaskOpportunity, view: string) {
  setTaskScope(projectId, { opportunity: row.id, action: '' }, { view, runId: run.id, auditId: run.audit_id });
}

export function SelectedOpportunityEvidence({ run, projectId, scope, onView, onOpenAnswer }: { run: EvidenceRun; projectId: string; scope: TaskScope; onView: (view: string) => void; onOpenAnswer?: (id: string) => void }) {
  const { page, error, retry } = useOpportunities(projectId, run.id, 'frozen');
  const [reading, setReading] = useState<EvidenceReadTarget | null>(null);
  const row = page?.items.find(value => value.id === scope.opportunity);
  const outside = row && (!matchesOpportunity(row, scope) || scopeIssues(run, scope).length > 0);
  return <section className="citation-panel citation-pad" aria-label="所选机会的原始证据"><div className="citation-section-head"><h2>所选机会的原始证据</h2><button type="button" onClick={() => onView('actions')}>返回对应任务 →</button></div>
    {error ? <div role="alert">{error}<button type="button" className="citation-link" onClick={retry}>重新读取 →</button></div> : !page ? <p role="status">正在读取原分析版本的机会…</p> : !row ? <p role="status" className="citation-notice citation-notice--warning">本分析版本中没有原选择的机会，未替换为第一条或其他版本的证据。请返回优化行动重新选择。</p> : <>
      {outside && <p role="status" className="citation-notice citation-notice--warning">原机会不属于当前比较范围。下方继续保留原始观察，不能解释为当前对象的证据。<button type="button" onClick={() => setTaskScope(projectId, originalOpportunityScope(row))}>明确返回机会原范围 →</button></p>}
      <h3>{row.finding}</h3><div className="task-chip-row">{row.platforms.map(name => <AiPlatformLabel platform={name} key={name} />)}<span className="citation-tag">{taskStates[row.actionability]}</span></div>
      <section><h3>诊断原文依据</h3>{row.task_pack?.diagnostic_evidence.length ? row.task_pack.diagnostic_evidence.map((reference, index) => <EvidenceCard key={index} reference={reference} onOpen={setReading} />) : <p className="citation-muted">本项尚未形成可用任务包；可先核对下方原始回答，不补造来源摘录。</p>}</section>
      {onOpenAnswer && <div className="citation-inline-actions">{row.subtargets.map((child, index) => <button key={index} type="button" disabled={!run.responses.some(response => response.id === child.response_id && response.platform === child.platform)} onClick={() => onOpenAnswer(child.response_id)}>打开<AiPlatformLabel platform={child.platform} iconSize={14} />这次回答 →</button>)}</div>}
      <OpportunityEvidence row={row} onEvidence={setReading} />
    </>}
    {reading && <EvidenceReading key={reading.owner_id + ':' + reading.start} reference={reading} projectId={projectId} onClose={() => setReading(null)} />}
  </section>;
}
