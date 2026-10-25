"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import type { EvidenceRun } from '@/types/intelligence';
import type { TaskPlan } from '@/lib/visibility/task-contract';
import { apiError, readTaskScope, setTaskScope, subscribeTaskScope } from '@/lib/visibility/task-view';
import { loadEligibleFacts, type FactCollection } from '@/lib/visibility/fact-reader';
import { EvidenceDraftExecution } from './evidence-draft-execution';
import { ManualContentTasks } from './manual-content-tasks';
import { TaskDelivery, EvidenceReading } from './task-details';
import type { EvidenceReference } from '@/lib/visibility/task-contract';
import './task-workspace.css';

type ApprovalState = { schema_version: number; action_id: string; revision: number; revision_id: string; latest_version: number;
  approval_id: string | null; bound_to_current_revision: boolean; authorization_state: 'not_verified'; can_authorize: boolean };
type Capabilities = { schemaVersion: number; enabled: boolean; generateDraft: { enabled: boolean; channels: string[] }; manualTask: { enabled: boolean; channels: string[] } };
const channelLabels: Record<string, string> = { wechat: '公众号', weibo: '微博', xiaohongshu: '小红书', douyin: '抖音', website: '网站人工任务', zhihu: '知乎人工任务', toutiao: '头条人工任务' };
async function read<T>(query: Record<string, string>, signal: AbortSignal, tasks = true): Promise<T> {
  const response = await fetch('/api/integration/intelligence' + (tasks ? '/tasks' : '') + '?' + new URLSearchParams(query), { signal, cache: 'no-store' });
  const raw = await response.json(); if (!response.ok) throw Error(apiError(raw, '材料读取失败，请刷新后重试。')); return raw;
}
export function DraftBriefs({ run, projectId }: { run: EvidenceRun; projectId: string }) {
  const location = useSyncExternalStore(subscribeTaskScope, () => window.location.search, () => '');
  const planId = location ? readTaskScope(projectId, location).action : '';
  const [plans, setPlans] = useState<TaskPlan[]>([]), [refresh, setRefresh] = useState(0);
  const [material, setMaterial] = useState<{ key: string; plan: TaskPlan; facts: FactCollection; state: ApprovalState; capabilities: Capabilities } | null>(null);
  const [channel, setChannel] = useState('wechat'), [title, setTitle] = useState(''), [reason, setReason] = useState(''), [reviewed, setReviewed] = useState(false);
  const [expiry, setExpiry] = useState(''), [receipt, setReceipt] = useState<{ key: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false), [manualRefresh, setManualRefresh] = useState(0);
  const [evidence, setEvidence] = useState<EvidenceReference | null>(null);
  const pending = useRef<string | null>(null), writing = useRef(false);
  const key = `${projectId}:${planId}:${refresh}`;
  const current = material?.key === key ? material : null;
  const approvalId = receipt?.key === key ? receipt.id : current?.state.bound_to_current_revision ? current.state.approval_id || '' : '';
  useEffect(() => {
    const controller = new AbortController();
    read<{ actions: TaskPlan[] }>({ projectId, op: 'plans', runId: run.id }, controller.signal).then(data => { if (!controller.signal.aborted) setPlans(data.actions); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [run.id, projectId, refresh]);
  useEffect(() => {
    if (!planId) return;
    const controller = new AbortController();
    (async () => {
      const plan = await read<TaskPlan>({ projectId, actionId: planId, op: 'detail' }, controller.signal);
      const [facts, state, capabilities] = await Promise.all([
        loadEligibleFacts(projectId, planId, plan.revision, plan.revision_id, controller.signal),
        read<ApprovalState>({ projectId, actionId: planId, op: 'draftApprovals', expectedRevision: String(plan.revision) }, controller.signal),
        read<Capabilities>({ projectId, view: 'evidenceCapabilities' }, controller.signal, false),
      ]);
      if (state.action_id !== planId || state.revision_id !== plan.revision_id || state.revision !== plan.revision || state.schema_version !== 3 || !Number.isSafeInteger(state.latest_version) || state.latest_version < 0) throw Error('授权与行动版本不一致，请刷新后核对。');
      if (!controller.signal.aborted) setMaterial({ key, plan, facts, state, capabilities });
    })().catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [planId, projectId, key]);
  const approve = async () => {
    if (writing.current || !current || !current.plan.target.task_pack) return;
    if (!pending.current) {
      const date = new Date(expiry); if (!Number.isFinite(date.getTime())) { setError('请填写有效的授权截止时间。'); return; }
      pending.current = JSON.stringify({ projectId, action: 'approveDraft', actionId: planId, factIds: current.plan.target.task_pack.own_fact_ids,
        expectedRevision: current.plan.revision, expectedVersion: current.state.latest_version, factsScopeReviewed: reviewed,
        channel, title: title.trim() || current.plan.title.slice(0, 200), reason, expiresAt: date.toISOString(), idempotencyKey: crypto.randomUUID() });
    }
    writing.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.current });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) { pending.current = null; setUncertain(false); if (response.status === 409) setConflict(true); } throw Error(apiError(data, '授权结果暂未确认，请使用同一操作重试。')); }
      if (!/^[a-f0-9]{32}$/.test(data.approval_id) || data.version !== current.state.latest_version + 1) throw Error('授权回执尚待核对，请使用同一操作重试。');
      pending.current = null; setUncertain(false); setReceipt({ key, id: data.approval_id });
      setMaterial({ ...current, state: { ...current.state, latest_version: data.version, approval_id: data.approval_id, bound_to_current_revision: true } });
    } catch (err) { if (pending.current) setUncertain(true); setError(err instanceof Error ? err.message : '授权结果暂未确认，请重试。'); }
    finally { writing.current = false; setBusy(false); }
  };
  const pack = current?.plan.target.task_pack;
  const facts = pack?.own_fact_ids.map(id => current!.facts.items.find(row => row.id === id));
  const validFacts = !!facts?.length && facts.every(fact => fact?.eligible);
  const supported = current?.capabilities.schemaVersion === 3 && current.capabilities.enabled && (
    current.capabilities.generateDraft.enabled && current.capabilities.generateDraft.channels.includes(channel) || current.capabilities.manualTask.enabled && current.capabilities.manualTask.channels.includes(channel));
  const locked = busy || uncertain || conflict;
  return <section className="citation-panel citation-pad citation-stack">
    <div className="citation-section-head"><div><h2>从行动准备内容材料</h2><p className="citation-muted">使用当前行动修订中已选择的我方事实，完整保留原问题和平台目标。授权后先生成待审核草稿，人工渠道保存为内容任务。</p></div><button type="button" className="dashboard-button dashboard-button--secondary" disabled={busy || uncertain} onClick={() => { setError(''); setConflict(false); setReviewed(false); setRefresh(value => value + 1); }}>刷新材料</button></div>
    <label className="task-field">行动计划<select className="dashboard-input" aria-label="内容行动计划" disabled={locked} value={planId} onChange={event => { setError(''); setReviewed(false); setTitle(''); setReason(''); setExpiry(''); setReceipt(null); setTaskScope(projectId, { action: event.target.value }); }}><option value="">选择行动计划</option>{plans.map(item => <option key={item.id} value={item.id}>{item.title} · 修订 {item.revision}</option>)}{planId && !plans.some(item => item.id === planId) && <option value={planId}>原选择的行动计划</option>}</select></label>
    {error && <p role="alert" className="citation-notice citation-notice--warning">{error}</p>}
    {planId && !current && !error && <p role="status">正在核对行动修订、当前事实与内容服务…</p>}
    {current && <>
      <p className="citation-tag">行动修订 {current.plan.revision} · {current.plan.approval_valid ? '计划批准有效' : '计划尚未批准或依据需重核'} · 内容授权版本 {current.state.latest_version}</p>
      {pack && <details className="task-history"><summary>查看完整交付和全部平台目标</summary><TaskDelivery pack={pack} onEvidence={setEvidence} /></details>}
      <div><h3>本修订选择的我方事实</h3>{facts?.map((fact, index) => <article className="task-material" key={pack!.own_fact_ids[index]}><p>{fact?.statement || '该事实当前不可用'}</p><p className="citation-muted">版本 {fact?.version || '未知'} · 仅适用：{fact?.scope || '需重新核对'} · {fact?.eligible ? '资格有效，仍需核对任务范围' : '当前不可用于授权'}</p></article>)}{!validFacts && <p className="citation-notice">先在行动中选择适用的有效我方事实，并批准新修订后再准备内容。</p>}<Link className="citation-link" href={'/intelligence?' + new URLSearchParams({ project: projectId, runId: current.plan.run_id, view: 'actions', actionId: planId })}>返回行动核对事实及计划 →</Link></div>
      {!supported && <p className="citation-notice citation-notice--warning">当前渠道的新版内容服务尚未就绪，请选择已开放渠道或稍后刷新。</p>}
      <fieldset className="citation-stack task-fact-list" disabled={locked || !current.state.can_authorize || !current.plan.approval_valid || !validFacts || !pack}>
        <label className="task-field">草稿主题<input aria-label="草稿主题" className="dashboard-input" maxLength={200} value={title} placeholder={current.plan.title.slice(0, 200)} onChange={event => setTitle(event.target.value)} /></label>
        <div className="task-scope-grid"><label>执行渠道<select aria-label="草稿执行渠道" value={channel} onChange={event => setChannel(event.target.value)}>{Object.entries(channelLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><label>授权截止<input className="dashboard-input" aria-label="草稿审批截止" type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} /></label></div>
        <label className="task-fact-choice"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />已核对所选我方事实适用于本任务的问题、品牌与范围，诊断中的竞品观察不作为我方声明。</label>
        <label className="task-field">内容授权依据<textarea className="dashboard-input" aria-label="草稿审批理由" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="说明内容实验目的与事实适用依据（至少5字）" /></label>
        <button type="button" className="dashboard-button dashboard-button--primary" disabled={!reviewed || !expiry || reason.trim().length < 5 || (title.trim() || current.plan.title.slice(0, 200)).length < 5 || !supported} onClick={() => void approve()}>批准本修订的内容材料</button>
      </fieldset>
      {conflict && <p role="alert">行动、事实或授权版本已变化，请刷新材料后重新核对。</p>}
      {uncertain && <button type="button" className="dashboard-button dashboard-button--secondary" disabled={busy} onClick={() => void approve()}>重试同一授权操作</button>}
    </>}
    {approvalId && <EvidenceDraftExecution key={`${projectId}-${approvalId}`} projectId={projectId} approvalId={approvalId} disabled={busy || uncertain || conflict} onManualCreated={() => setManualRefresh(old => old + 1)} />}
    <ManualContentTasks key={`${projectId}-${manualRefresh}`} projectId={projectId} />
    {evidence && <EvidenceReading projectId={projectId} reference={evidence} onClose={() => setEvidence(null)} />}
  </section>;
}
