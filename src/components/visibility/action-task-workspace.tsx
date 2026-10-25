"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import { SCENARIOS } from '@/lib/visibility/scenarios';
import type { EvidenceRun } from '@/types/intelligence';
import type { EvidenceReference, OpportunityPage, TaskOpportunity, TaskPack, TaskPlan, TaskRevision } from '@/lib/visibility/task-contract';
import { taskPackSchema } from '@/lib/visibility/task-contract';
import { loadOpportunities } from '@/lib/visibility/opportunity-reader';
import { originalOpportunityScope, readPriority } from '@/lib/visibility/analysis-scope';
import { apiError, emptyTaskScope, matchesOpportunity, planPlatforms, readTaskScope, setTaskScope, subscribeTaskScope, taskStates } from '@/lib/visibility/task-view';
import { DependencyDifferences, EvidenceReading, OpportunityEvidence, RevisionDifferences, TaskDelivery } from './task-details';
import './task-workspace.css';

const endpoint = '/api/integration/intelligence/tasks';
class RequestError extends Error { constructor(public status: number, public data: unknown) { super(apiError(data, status === 409 ? '任务版本或相关依据已变化，请刷新核对。' : '任务读取或保存失败，请重试。')); } }
async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new RequestError(response.status, data);
  return data;
}
type Edit = { plan: TaskPlan; seed: TaskPack | null; diagnosisId?: string; title: string; deliverable: string; outline: string; acceptance: string; factIds: string[]; reason: string; conflict: boolean };

export function TaskWorkspace({ run, projectId, readOnly = false, scopeControls = true }: { run: Pick<EvidenceRun, 'id' | 'summary'>; projectId: string; readOnly?: boolean; platform?: string; scopeControls?: boolean }) {
  const location = useSyncExternalStore(subscribeTaskScope, () => window.location.search, () => '');
  const scope = useMemo(() => location ? readTaskScope(projectId, location) : emptyTaskScope, [location, projectId]);
  const priority = readPriority(projectId, location);
  const [queue, setQueue] = useState('all'), [visible, setVisible] = useState(20);
  const [collection, setCollection] = useState<{ key: string; page: OpportunityPage; plans: TaskPlan[]; writable: boolean } | null>(null);
  const [detail, setDetail] = useState<{ key: string; plan: TaskPlan } | null>(null), [refresh, setRefresh] = useState(0);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [approval, setApproval] = useState<TaskPlan | null>(null), [reason, setReason] = useState(''), [edit, setEdit] = useState<Edit | null>(null);
  const [evidence, setEvidence] = useState<EvidenceReference | null>(null), [observation, setObservation] = useState<TaskOpportunity | null>(null);
  const [history, setHistory] = useState<{ action: string; rows: TaskRevision[]; next: number | null; loading: boolean; error: string } | null>(null);
  const pending = useRef<string | null>(null), writing = useRef(false), alive = useRef(true);
  const currentPanel = useRef<HTMLElement>(null), lastSelection = useRef('');
  const address = useCallback((extra: Record<string, string>) => endpoint + '?' + new URLSearchParams({ projectId, ...extra }), [projectId]);
  const collectionKey = `${projectId}:${run.id}:${priority}:${refresh}`;
  const data = collection?.key === collectionKey ? collection : null;
  const rows = data?.page.items || [];
  const selected = rows.find(row => row.id === scope.opportunity);
  const current = scope.action ? (detail?.key === `${projectId}:${scope.action}:${refresh}` ? detail.plan : null) : null;
  const targets = run.summary.brand_presence?.targets || [];
  const name = (id: string) => targets.find(row => row.target_id === id)?.name || '历史品牌目标';
  const invalidScope = !!scope.own && !targets.some(row => row.target_id === scope.own && row.role === 'own') || !!scope.comparison && !targets.some(row => row.target_id === scope.comparison);
  const locked = readOnly || data?.writable === false || busy || uncertain || invalidScope;
  const filtered = invalidScope ? [] : rows.filter(row => matchesOpportunity(row, scope) && (queue === 'all' || (queue === 'review' ? row.actionability === 'ready_for_review' : row.actionability !== 'ready_for_review')));
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      const page = await loadOpportunities(projectId, run.id, priority, abort.signal);
      const plans = await read<{ actions: TaskPlan[] }>(address({ op: 'plans', runId: run.id }), abort.signal);
      if (!abort.signal.aborted) setCollection({ key: collectionKey, page, plans: plans.actions, writable: page.can_write });
    })().catch(err => { if (!abort.signal.aborted) setError(err.message); });
    return () => abort.abort();
  }, [address, projectId, run.id, priority, collectionKey]);
  useEffect(() => {
    if (!scope.action) return;
    const abort = new AbortController(), key = `${projectId}:${scope.action}:${refresh}`;
    read<TaskPlan>(address({ op: 'detail', actionId: scope.action }), abort.signal).then(plan => { if (!abort.signal.aborted) setDetail({ key, plan }); })
      .catch(err => { if (!abort.signal.aborted) setError(err.message); });
    return () => abort.abort();
  }, [address, projectId, scope.action, refresh]);
  useEffect(() => {
    const key = scope.opportunity + ':' + scope.action;
    if (!data || key === ':' || lastSelection.current === key || !currentPanel.current) return;
    lastSelection.current = key;
    currentPanel.current.scrollIntoView?.({ block: 'start', behavior: 'auto' });
    currentPanel.current.focus({ preventScroll: true });
  }, [scope.opportunity, scope.action, data]);
  const send = async (payload?: Record<string, unknown>) => {
    if (writing.current || readOnly || data?.writable === false) return;
    if (payload && invalidScope) { setError('原比较范围已失效，请重新核对后操作。'); return; }
    if (payload && !pending.current) pending.current = JSON.stringify({ projectId, ...payload, idempotencyKey: crypto.randomUUID() });
    if (!pending.current) return;
    const request = JSON.parse(pending.current) as { op: string };
    writing.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.current });
      const body = await response.json();
      if (!response.ok) {
        if (response.status >= 500) throw Error('保存结果暂未确认，请重试同一操作。');
        pending.current = null; setUncertain(false);
        if (response.status === 409) { setEdit(value => value ? { ...value, conflict: true } : value); setRefresh(value => value + 1); }
        throw new RequestError(response.status, body);
      }
      pending.current = null;
      if (!alive.current) return;
      setUncertain(false); setEdit(null); setApproval(null); setReason(''); setHistory(null);
      const plan = (body.action || body) as TaskPlan;
      if (plan.id) setTaskScope(projectId, { action: plan.id, opportunity: rows.find(row => row.task_key === plan.task_key)?.id || '' });
      setMessage('操作已保存。' + (request.op === 'approve' ? '本修订计划已批准；我方事实、内容交付和发布仍须分别核对。' : request.op === 'revise' ? '新修订需要独立批准，原版本与批准记录仍保留。' : '行动计划已创建，请核对并审核此版本。'));
      setRefresh(value => value + 1);
    } catch (err) {
      if (!alive.current) return;
      if (pending.current) setUncertain(true);
      setError(err instanceof Error ? err.message : '保存结果暂未确认，请重试同一操作。');
    } finally { writing.current = false; if (alive.current) setBusy(false); }
  };
  const choose = (row: TaskOpportunity) => { setError(''); setMessage(''); const plan = data?.plans.find(plan => plan.task_key === row.task_key); setTaskScope(projectId, { opportunity: row.id, action: plan?.id || '' }); };
  const materials = () => setTaskScope(projectId, {}, { view: 'sources', sourceType: 'owned' });
  const beginEdit = (plan: TaskPlan) => {
    const candidate = selected?.task_key === plan.task_key && selected.record_id && plan.run_id !== run.id ? selected : null;
    const pack = candidate?.task_pack || plan.target.task_pack || null;
    setEdit({ plan, seed: pack, diagnosisId: candidate?.record_id, title: plan.title, deliverable: pack?.deliverable || '', outline: pack?.delivery.outline.join('\n') || '', acceptance: pack?.acceptance.join('\n') || '', factIds: [...pack?.own_fact_ids || []], reason: '', conflict: false });
  };
  const saveEdit = () => {
    if (!edit || edit.conflict) return;
    const pack = edit.seed ? { ...edit.seed, deliverable: edit.deliverable.trim(), delivery: { ...edit.seed.delivery, outline: edit.outline.split('\n').map(row => row.trim()).filter(Boolean) }, acceptance: edit.acceptance.split('\n').map(row => row.trim()).filter(Boolean), own_fact_ids: edit.factIds } : undefined;
    if (pack && !taskPackSchema.safeParse(pack).success) { setError('请填写完整交付、至少两条提纲和一条验收标准，每条至少5字。'); return; }
    void send({ op: 'revise', actionId: edit.plan.id, expectedRevision: edit.plan.revision, reason: edit.reason, title: edit.title, ...(pack ? { taskPack: pack } : {}), ...(edit.diagnosisId ? { diagnosisId: edit.diagnosisId } : {}) });
  };
  const loadHistory = async (plan: TaskPlan, offset = 0) => {
    setHistory(previous => ({ action: plan.id, rows: offset && previous?.action === plan.id ? previous.rows : [], next: null, loading: true, error: '' }));
    try {
      const page = await read<{ revisions: TaskRevision[] }>(address({ op: 'revisions', actionId: plan.id, offset: String(offset), limit: '20' }));
      if (alive.current) setHistory(previous => previous?.action === plan.id ? { ...previous, rows: offset ? [...previous.rows, ...page.revisions] : page.revisions, next: page.revisions.length === 20 ? offset + 20 : null, loading: false, error: '' } : previous);
    } catch (err) { if (alive.current) setHistory(previous => previous ? { ...previous, loading: false, error: err instanceof Error ? err.message : '历史版本读取失败' } : previous); }
  };
  const sameTask = !current || !selected || current.task_key === selected.task_key;
  const scopeRow = current?.target.task_pack ? current.target as TaskOpportunity : selected;
  const selectedInScope = !invalidScope && (!scopeRow || matchesOpportunity(scopeRow, scope));
  const selectedPack = scope.action ? current?.target.task_pack : selected?.task_pack;
  const editChanged = !!edit && (edit.title.trim() !== edit.plan.title || !!edit.diagnosisId || !!edit.plan.dependency_changes.length || !!edit.seed && (
    edit.deliverable.trim() !== edit.seed.deliverable || edit.outline !== edit.seed.delivery.outline.join('\n') || edit.acceptance !== edit.seed.acceptance.join('\n') || JSON.stringify(edit.factIds) !== JSON.stringify(edit.seed.own_fact_ids)));
  return <section className="citation-stack task-workspace" aria-label="优化行动与具体任务">
    <div className="citation-panel citation-pad"><div className="citation-section-head"><div><h2>找到值得执行的改进</h2><p className="citation-muted">每项任务保留原问题、平台子目标、证据与验收；核实、批准和内容发布各自记录。</p></div><button type="button" className="dashboard-button dashboard-button--secondary" disabled={busy} onClick={() => { setError(''); setRefresh(value => value + 1); }}>刷新任务</button></div>
      {scopeControls && <div className="task-scope-grid">
        <label>自有品牌<select aria-label="行动自有品牌" value={scope.own} onChange={e => setTaskScope(projectId, { own: e.target.value })}><option value="">全部自有品牌</option>{targets.filter(row => row.role === 'own').map(row => <option key={row.target_id} value={row.target_id}>{row.name}</option>)}{scope.own && !targets.some(row => row.target_id === scope.own) && <option value={scope.own}>原选择已不在此版本</option>}</select></label>
        <label>对比对象<select aria-label="行动对比品牌" value={scope.comparison} onChange={e => setTaskScope(projectId, { comparison: e.target.value })}><option value="">全部对比对象</option>{targets.filter(row => row.role !== 'own' && row.role !== 'comparison').map(row => <option key={row.target_id} value={row.target_id}>{row.name}{row.identity_status === 'confirmed' ? '' : ' · 身份待核实'}</option>)}{scope.comparison && !targets.some(row => row.target_id === scope.comparison) && <option value={scope.comparison}>原选择已不在此版本</option>}</select></label>
        <label>目标平台<select aria-label="行动目标平台" value={scope.platform} onChange={e => setTaskScope(projectId, { platform: e.target.value })}><option value="">全部平台</option>{[...new Set(rows.flatMap(row => row.platforms))].map(value => <option key={value} value={value}>{getAiPlatformLabel(value)}</option>)}</select></label>
        <label>需求场景<select aria-label="行动需求场景" value={scope.scenario} onChange={e => setTaskScope(projectId, { scenario: e.target.value })}><option value="all">全部场景</option>{Object.entries(SCENARIOS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}<option value="unreviewed">场景待审核</option></select></label>
      </div>}
      <div className="task-priority-choice"><label>任务排序<select aria-label="任务排序" value={priority} disabled={busy} onChange={e => setTaskScope(projectId, {}, { priority: e.target.value })}><option value="frozen">本次审计冻结排序</option><option value="current">按当前业务偏好预览</option></select></label><p className="citation-muted">{priority === 'current' ? '只读排序预览，不重采、不重分析，不改旧任务或批准。' : '按纠错紧迫性、场景重要性、证据准备、覆盖和可控性排序；不代表收益或成功概率。'}</p></div>
    </div>
    {error && <p role="alert" className="citation-notice citation-notice--warning">{error}</p>}{message && <p role="status" className="citation-notice">{message}</p>}
    {uncertain && <div className="citation-notice citation-notice--warning"><p>结果暂未确认。重试会使用原请求和原操作编号，不会另建一份任务修订。</p><button type="button" className="dashboard-button dashboard-button--secondary" disabled={busy} onClick={() => void send()}>重试同一操作</button></div>}
    {invalidScope && <p role="status" className="citation-notice citation-notice--warning">原选择不在当前分析版本中，请重新选择范围；不会自动替换为第一个品牌。</p>}
    {!data ? !error && <p role="status">正在读取机会与行动版本…</p> : <>
      {data.writable === false && <p className="citation-notice">当前为只读权限，可以核对任务和历史，无法修改或批准。</p>}
      {(data.page.status !== 'evaluated' || Object.keys(data.page.deferred_candidates || {}).length > 0 || !!data.page.deferred_task_count) && <p className="citation-notice citation-notice--warning">{!data.page.version ? '本分析版本尚未生成六类机会，请查看完成新版分析后的修订。' : data.page.status === 'needs_own_target' ? '尚未确认可用的自有品牌目标，请先核对项目品牌。' : '本次分析覆盖仍有未知或延后处理项，没有发现不等于没有优化空间。'} {data.page.deferred_task_count ? `另有 ${data.page.deferred_task_count} 项任务延后处理。` : ''}</p>}
      {data.page.registry_context_changed && <p className="citation-notice citation-notice--warning">当前品牌名单与本审计冻结范围不同。排序预览仍沿用原观察，请先核对品牌身份和分析版本。</p>}
      <div className="citation-tabs" role="tablist" aria-label="任务准备状态">{[['all', '全部机会'], ['review', '待审核'], ['preparation', '先准备材料或证据']].map(([value, text]) => <button type="button" role="tab" aria-selected={queue === value} key={value} onClick={() => { setQueue(value); setVisible(20); }}>{text}</button>)}</div>
      <div className="task-card-grid">{filtered.slice(0, visible).map(row => <article key={row.id} className="citation-panel citation-pad task-card"><div className="citation-section-head"><small>{row.priority ? `优先序 ${row.priority.rank}` : '待核对'} · {row.kind_labels.join(' / ')}</small><span className="citation-tag">{taskStates[row.actionability]}</span></div>
        <h3>{row.task_pack?.deliverable || row.finding}</h3><div className="task-chip-row"><span>{name(row.own_target_id)}</span>{row.platforms.map(value => <AiPlatformLabel key={value} platform={value} />)}</div>
        <p className="task-observed"><b>本次观察</b>{row.finding}</p><p className="task-material">{row.task_pack?.missing_materials.length ? `待准备：${row.task_pack.missing_materials.join('；')}` : row.actionability === 'ready_for_review' ? '材料已有核对候选，仍需审核适用范围。' : '先核对身份、范围和证据条件。'}</p>
        <div className="task-meta">{row.task_pack?.delivery.asset_title || '交付对象待核对'} · {row.task_pack?.ai_targets.length || 0} 个平台场景目标</div>
        <div className="citation-inline-actions"><button type="button" onClick={() => setObservation(row)}>查看证据与假设 →</button><button type="button" onClick={() => choose(row)}>查看具体任务 →</button></div>
      </article>)}</div>
      {!filtered.length && <div className="citation-panel citation-pad"><h3>当前范围没有具备依据的机会</h3><p className="citation-muted">仅表示本次已处理材料中没有匹配项；不会把分析失败、未知或没有资料解释为品牌没有能力。</p></div>}
      {filtered.length > visible && <button type="button" className="dashboard-button dashboard-button--secondary" onClick={() => setVisible(value => value + 20)}>继续展示任务 · 已显示 {visible} / {filtered.length}</button>}
      {(selected || scope.action) && <section ref={currentPanel} tabIndex={-1} className="citation-panel citation-pad task-current" aria-label="当前具体任务"><div className="citation-section-head"><div><small>行动任务{current ? ` · 修订 ${current.revision}` : ''}</small><h2>{current?.title || selected?.task_pack?.deliverable || selected?.finding || '正在读取行动…'}</h2></div><span className="citation-tag">{current?.status === 'stale' ? '相关依据需重核' : current?.approval_valid ? '计划批准有效' : current ? '计划待批准' : '尚未创建计划'}</span></div>
        {!selectedInScope && <div className="citation-notice citation-notice--warning"><p>这项任务不属于当前筛选范围，原任务与证据仍保留。</p><button type="button" onClick={() => setTaskScope(projectId, originalOpportunityScope(scopeRow!))}>返回任务原范围 →</button></div>}
        {!sameTask && <p className="citation-notice citation-notice--warning">所选机会与当前行动不是同一任务，原证据与交付保持各自归属。请重新选择对应行动，不能把另一条机会套入本计划。</p>}
        {scope.opportunity && !selected && <p className="citation-notice citation-notice--warning">此分析版本中没有原选择的机会，请核对分析版本或重新选择。</p>}
        {current && current.run_id !== run.id && <p className="citation-notice citation-notice--warning">行动当前依据属于另一分析版本。查看旧原文时仍使用原版本；采用本次机会须显式创建修订并重新批准。<a className="citation-link" href={'/intelligence?' + new URLSearchParams({ project: projectId, runId: current.run_id, view: 'actions', actionId: current.id })}>查看行动分析版本 →</a></p>}
        <div className="task-status-rail"><span>发现与证据</span><span>{selectedPack?.own_fact_ids.length ? '我方事实待核对' : '材料准备'}</span><span>{current?.approval_valid ? '计划已批准' : '计划待批准'}</span><span>内容与交付待核对</span></div>
        {current?.dependency_changes.length ? <><p className="citation-notice citation-notice--warning">相关依据变化后不能继续使用原批准。请核对差异、选择新依据并创建新修订。</p><DependencyDifferences changes={current.dependency_changes} /></> : null}
        {selectedPack ? <TaskDelivery key={current?.revision_id || selected?.id} pack={selectedPack} onEvidence={setEvidence} /> : current ? <p>{current.target.action?.task || current.title}</p> : <p>本条证据尚不足以形成完整任务包。</p>}
        {selected && sameTask && <details className="task-history"><summary>核对本次观察、假设与限制</summary><OpportunityEvidence row={selected} onEvidence={setEvidence} /></details>}
        {selected?.priority && sameTask && <details className="task-history"><summary>为什么按此顺序处理</summary><ul className="task-list">{selected.priority.basis.map((text, index) => <li key={index}>{text}</li>)}</ul><p>场景重要性 {selected.priority.scenario_importance} / 100 · 目标覆盖 {selected.priority_inputs.target_coverage} · 提纲步骤 {selected.priority_inputs.outline_steps}（非工时）</p><p className="citation-muted">任务处于{selected.priority.queue === 'review' ? '审核队列' : '准备队列'}，排序不代表预期收益。</p></details>}
        <div className="citation-inline-actions">
          {selected && !current && !scope.action && selected.action && selected.task_pack && selected.record_id && selected.actionability !== 'not_applicable' && <button type="button" className="dashboard-button dashboard-button--primary" disabled={locked} onClick={() => void send({ op: 'create', runId: run.id, diagnosisId: selected.record_id })}>创建具体行动计划</button>}
          {current && <><button type="button" className="dashboard-button dashboard-button--secondary" disabled={locked} onClick={() => beginEdit(current)}>修改并创建新修订</button><button type="button" disabled={busy} onClick={() => void loadHistory(current)}>查看修订与批准历史 →</button>
            <button type="button" className="dashboard-button dashboard-button--primary" disabled={locked || current.status !== 'proposed'} onClick={() => { setReason(''); setApproval(current); }}>审核并批准计划</button></>}
          <button type="button" className="dashboard-button dashboard-button--secondary" onClick={materials}>补齐并核实我方材料</button>
        </div>
        {selected && (!selected.action || selected.actionability === 'not_applicable') && <p className="citation-muted">当前仅保留核对线索，范围或任务条件未满足，不能创建执行计划。</p>}
        <p className="citation-muted">计划批准只授权开展该版本任务；我方事实、内容交付和发布仍须分别核对。</p>
      </section>}
      {!!data.plans.length && <section className="citation-panel citation-pad"><h2>本分析版本的行动计划</h2>{data.plans.map(plan => <div className="citation-action-row" key={plan.id}><div><h3>{plan.title}</h3><div className="task-chip-row">{planPlatforms(plan).map(value => <AiPlatformLabel platform={value} key={value} />)}<small>修订 {plan.revision} · {plan.approval_valid ? '计划批准有效' : plan.status === 'stale' ? '依据需重核' : '待批准'}</small></div></div><button type="button" onClick={() => setTaskScope(projectId, { action: plan.id, opportunity: rows.find(row => row.task_key === plan.task_key)?.id || '' })}>查看完整任务 →</button></div>)}</section>}
      {!!run.summary.diagnoses?.some(row => row.action && row.record_id && !('task_key' in row)) && <details className="citation-deep-details"><summary>数据与身份核实任务</summary>{run.summary.diagnoses.filter(row => row.action && row.record_id && !('task_key' in row)).map(row => <div key={row.record_id} className="citation-action-row"><p>{row.finding}</p><button type="button" disabled={locked} onClick={() => void send({ op: 'create', runId: run.id, diagnosisId: row.record_id })}>创建核实计划</button></div>)}</details>}
    </>}
    {observation && !evidence && <ReadingDrawer title="机会依据与原因假设" onClose={() => setObservation(null)} closeLabel="关闭机会依据"><h3>{observation.task_pack?.deliverable || observation.finding}</h3><OpportunityEvidence row={observation} onEvidence={setEvidence} />{observation.task_pack && <TaskDelivery pack={observation.task_pack} onEvidence={setEvidence} />}<button type="button" className="dashboard-button dashboard-button--primary" onClick={() => { choose(observation); setObservation(null); }}>进入具体任务</button></ReadingDrawer>}
    {evidence && <EvidenceReading key={[evidence.run_id, evidence.segment_id, evidence.start].join(':')} reference={evidence} projectId={projectId} onClose={() => setEvidence(null)} />}
    {approval && <ReadingDrawer title={`审核行动计划 · 修订 ${approval.revision}`} eyebrow="计划审核" variant="modal" closeLabel="关闭计划审核" onClose={() => setApproval(null)}><p>{approval.title}</p><p className="citation-muted">确认原问题、全部平台子目标、材料限制与验收；批准范围仅限本修订的任务计划。</p><label className="task-field">审批依据<textarea className="dashboard-input" value={reason} disabled={locked} maxLength={2000} onChange={e => setReason(e.target.value)} /></label><button type="button" className="dashboard-button dashboard-button--primary" disabled={locked || reason.trim().length < 5 || current?.revision !== approval.revision || current?.status !== 'proposed'} onClick={() => void send({ op: 'approve', actionId: approval.id, expectedRevision: approval.revision, reason })}>批准本修订计划</button>{uncertain && <button type="button" className="dashboard-button dashboard-button--secondary" disabled={busy} onClick={() => void send()}>重试同一操作</button>}{error && <p role="alert">{error}</p>}</ReadingDrawer>}
    {edit && <ReadingDrawer title={`创建新修订 · 当前修订 ${edit.plan.revision}`} variant="modal" closeLabel="关闭任务修订" onClose={() => setEdit(null)}><p className="citation-muted">旧任务、批准及产物会保留。修改交付后必须重新审批，不自动继承旧批准。</p>{edit.diagnosisId && <p className="citation-notice">此修订明确采用当前分析中的同一任务诊断及其全部平台目标。</p>}
      <fieldset disabled={locked || edit.conflict} className="citation-stack"><label className="task-field">行动标题<input className="dashboard-input" value={edit.title} maxLength={2000} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label>
        {edit.seed && <><label className="task-field">具体交付<textarea className="dashboard-input" value={edit.deliverable} maxLength={2000} onChange={e => setEdit({ ...edit, deliverable: e.target.value })} /></label><label className="task-field">交付提纲（一行一项，至少两项）<textarea className="dashboard-input" rows={6} value={edit.outline} onChange={e => setEdit({ ...edit, outline: e.target.value })} /></label><label className="task-field">验收标准（一行一项）<textarea className="dashboard-input" rows={4} value={edit.acceptance} onChange={e => setEdit({ ...edit, acceptance: e.target.value })} /></label>
          {!!edit.seed.own_fact_ids.length && <div><h3>本修订保留的我方事实</h3><p className="citation-muted">撤回或不再适用的条目可以移除；移除不代表材料需求已被满足。</p>{edit.seed.own_fact_ids.map((id, index) => <label className="task-fact-choice" key={id}><input type="checkbox" checked={edit.factIds.includes(id)} onChange={e => setEdit({ ...edit, factIds: e.target.checked ? [...edit.factIds, id] : edit.factIds.filter(value => value !== id) })} />保留事实 {index + 1} · {selected?.material_readiness.approved_fact_candidates.find(row => row.id === id)?.statement || '按原批准事实记录核对'}</label>)}</div>}</>}
        <label className="task-field">本次修订依据<textarea className="dashboard-input" value={edit.reason} maxLength={2000} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></label><button type="button" className="dashboard-button dashboard-button--primary" disabled={edit.reason.trim().length < 5 || edit.title.trim().length < 5 || !editChanged} onClick={saveEdit}>保存新修订，重新审核</button>
      </fieldset>{!editChanged && <p className="citation-muted">先修改具体交付或核对相关依据变化，再保存新版本。</p>}{edit.conflict && <p role="alert" className="citation-notice citation-notice--warning">原版本或依据已经变化，本次编辑没有自动套用到新版本。请关闭后核对最新差异，再重新编辑。</p>}{uncertain && <button type="button" className="dashboard-button dashboard-button--secondary" disabled={busy} onClick={() => void send()}>重试同一操作</button>}{error && <p role="alert">{error}</p>}</ReadingDrawer>}
    {history && <ReadingDrawer title="行动修订与批准历史" closeLabel="关闭修订历史" onClose={() => setHistory(null)}><p className="citation-muted">历史批准保留原版本，不代表当前任务仍有执行授权。</p>{history.rows.map(row => <article className="task-revision" key={row.id}><h3>修订 {row.revision}{row.is_current ? ' · 当前版本' : ' · 历史版本'}</h3><p>{row.payload.title}</p><p>{row.reason}</p><small>{new Date(row.created_at).toLocaleString('zh-CN')} · {row.approval ? '曾获具名批准' : '未记录批准'}</small>{!row.integrity_valid && <p role="alert">历史载荷校验未通过，请停止使用该版本。</p>}<RevisionDifferences changes={row.changes_from_previous} /><details className="task-history"><summary>查看该版本完整交付与证据</summary>{row.payload.target.task_pack ? <TaskDelivery pack={row.payload.target.task_pack} onEvidence={ref => { setHistory(null); setEvidence(ref); }} /> : <p>{row.payload.target.action?.task || row.payload.title}</p>}{row.approval && <p>原批准依据：{row.approval.reason} · {row.approval.historical_signature_valid ? '原签名校验通过' : '签名校验未通过'}</p>}{!!row.draft_approval_ids.length && <p>{row.draft_approval_ids.length} 份草稿批准记录属于此原版本。</p>}</details></article>)}{history.loading && <p role="status">正在读取修订…</p>}{history.error && <p role="alert">{history.error}</p>}{history.next !== null && current && <button type="button" disabled={history.loading} onClick={() => void loadHistory(current, history.next!)}>继续读取历史版本</button>}</ReadingDrawer>}
  </section>;
}
