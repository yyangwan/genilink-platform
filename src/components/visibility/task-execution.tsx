"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import type { TaskPack } from '@/lib/visibility/task-contract';
import { apiError, safeHttp } from '@/lib/visibility/task-view';
import { artifactKinds, artifactLabels, executionRead, readEvents, readExecution, operationLabels, statusLabels, type Execution, type ExecutionEvent, type ExecutionSnapshot, type Member } from '@/lib/visibility/execution-contract';
import './task-execution.css';

type Operation = 'assign' | 'prepare' | 'start' | 'deliver' | 'return' | 'accept' | 'cancel';
type ArtifactInput = { key: string; kind: typeof artifactKinds[number]; title: string; url: string; referenceId: string; notes: string };
type Editor = { kind: Operation; version: number; owner: string; due: string; reason: string; artifacts: ArtifactInput[]; checks: boolean[] };
const endpoint = '/api/integration/intelligence/execution';
const date = (value: string | null) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未设置';
const localDate = (value: string | null) => { if (!value) return ''; const time = new Date(value); return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const roleNames: Record<string, string> = { owner: '负责人', admin: '管理员', editor: '编辑', member: '成员' };
const validUrl = (value: string) => { try { const url = new URL(value.trim()); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } };

function Delivery({ snapshot }: { snapshot: ExecutionSnapshot }) {
  const delivery = snapshot.delivery;
  if (!delivery) return null;
  const label = snapshot.status === 'accepted' ? '本次交付已验收' : snapshot.status === 'cancelled' ? '执行已取消，保留原交付' : snapshot.acceptance?.decision === 'return' ? '需修改后重新提交' : '等待具名验收';
  return <section className="execution-delivery" aria-label="最近一次交付"><div className="citation-section-head"><h3>最近一次交付</h3><span className="citation-tag">{label}</span></div>
    {delivery.artifacts.map((item, index) => <article className="task-material execution-artifact" key={index}><div className="citation-section-head"><strong>{item.title}</strong><span className="citation-tag">{artifactLabels[item.kind]} · {item.verification === 'service_receipt' ? '来源已核对' : '人工登记'}</span></div>
      {safeHttp(item.url) && <a className="citation-link" href={item.url!} target="_blank" rel="noopener noreferrer">{item.url}</a>}
      {item.reference_id && <p>来源任务编号：{item.reference_id}</p>}{item.notes && <p>{item.notes}</p>}
      {item.receipt && <small>保留原内容授权及任务修订，不代表内容质量已获验收。</small>}
    </article>)}
    <p>{delivery.notes}</p><p className="citation-muted">提交于 {date(delivery.submitted_at)} · 登记与验收不会自动发布内容。</p>
    {snapshot.acceptance && <div className="task-material"><h4>{snapshot.acceptance.decision === 'accept' ? '验收依据' : '退回修改依据'}</h4><p>{snapshot.acceptance.reason}</p>{snapshot.acceptance.checks.map(check => <p key={check.index}>{check.met ? '已满足' : '待修改'} · {check.criterion}{check.note ? `：${check.note}` : ''}</p>)}</div>}
  </section>;
}

function EventDetails({ snapshot }: { snapshot: ExecutionSnapshot }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>查看当时的安排与交付</summary>{open && <><p>负责人：{snapshot.owner?.name || '未安排'} · 截止：{date(snapshot.due_at)} · 状态：{statusLabels[snapshot.status]}</p><Delivery snapshot={snapshot} /></>}</details>;
}

type ExecutionProps = {
  projectId: string; actionId: string; revision: number; revisionId: string; pack: TaskPack; readOnly?: boolean; blocked?: boolean; refreshKey?: string; onWriteLock?: (value: boolean) => void;
};
export function TaskExecution(props: ExecutionProps) {
  return <ExecutionPanel key={`${props.projectId}:${props.actionId}:${props.revisionId}`} {...props} />;
}
function ExecutionPanel({ projectId, actionId, revision, revisionId, pack, readOnly = false, blocked = false, refreshKey, onWriteLock }: ExecutionProps) {
  const [state, setState] = useState<Execution | null>(null), [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<ExecutionEvent[]>([]), [next, setNext] = useState<number | null>(null), [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [historyError, setHistoryError] = useState('');
  const [memberError, setMemberError] = useState('');
  const pending = useRef<string | null>(null), writing = useRef(false), alive = useRef(true), sequence = useRef(0);
  const lock = busy || uncertain;
  useEffect(() => { alive.current = true; return () => { alive.current = false; sequence.current += 1; }; }, []);
  useEffect(() => { onWriteLock?.(lock); return () => onWriteLock?.(false); }, [lock, onWriteLock]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const number = ++sequence.current;
    const [value, history] = await Promise.all([readExecution(projectId, actionId, revision, revisionId, signal), readEvents(projectId, actionId, revision, revisionId, undefined, signal)]);
    if ((history.events[0]?.version || 0) !== value.version) throw Error('执行状态与历史版本已变化，请重新读取。');
    if (!alive.current || signal?.aborted || number !== sequence.current) return;
    setState(value); setEvents(history.events); setNext(history.next_before); setHistoryError('');
  }, [projectId, actionId, revision, revisionId]);
  const loadMembers = useCallback(async (signal?: AbortSignal) => {
    const raw = await executionRead({ projectId, op: 'members' }, signal);
    return z.object({ members: z.array(z.object({ id: z.string(), name: z.string(), role: z.string() })) }).parse(raw).members;
  }, [projectId]);
  useEffect(() => {
    const abort = new AbortController();
    load(abort.signal).catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : '执行记录读取失败。'); });
    if (!readOnly) void loadMembers(abort.signal).then(value => {
      if (!abort.signal.aborted) { setMembers(value); setMemberError(''); }
    }).catch(() => { if (!abort.signal.aborted) setMemberError('负责人清单暂不可读，请刷新执行记录后重试。'); });
    return () => abort.abort();
  }, [load, loadMembers, readOnly, refreshKey]);
  const refresh = async () => {
    if (lock) return;
    setError(''); setHistoryError(''); setLoading(true);
    try { await Promise.all([load(), readOnly ? undefined : loadMembers().then(value => {
      if (alive.current) { setMembers(value); setMemberError(''); }
    }).catch(() => { if (alive.current) setMemberError('负责人清单暂不可读，请刷新执行记录后重试。'); })]); setConflict(false); } catch (err) { setState(null); setError(err instanceof Error ? err.message : '执行记录读取失败。'); }
    finally { if (alive.current) setLoading(false); }
  };
  const moreEvents = async () => {
    if (!next || loading) return;
    const generation = sequence.current; setLoading(true); setHistoryError('');
    try {
      const page = await readEvents(projectId, actionId, revision, revisionId, next);
      if (!alive.current || generation !== sequence.current) return;
      if (page.events.some(row => events.some(old => old.id === row.id)) || events.length && page.events.length && page.events[0].version !== events.at(-1)!.version - 1) throw Error('执行历史已变化，请刷新后重新读取。');
      setEvents(previous => [...previous, ...page.events]); setNext(page.next_before);
    } catch (err) { if (alive.current && generation === sequence.current) setHistoryError(err instanceof Error ? err.message : '历史记录读取失败。'); }
    finally { if (alive.current && generation === sequence.current) setLoading(false); }
  };
  const open = (kind: Operation) => {
    if (!state || lock || conflict || blocked || readOnly || !state.is_current) return;
    setError(''); setMessage(''); setConflict(false);
    setEditor({ kind, version: state.version, owner: state.snapshot.owner?.id || '', due: localDate(state.snapshot.due_at), reason: '', checks: pack.acceptance.map(() => false),
      artifacts: [{ key: crypto.randomUUID(), kind: 'external_url', title: '', url: '', referenceId: '', notes: '' }] });
  };
  const send = async (operation?: Operation) => {
    if (!state || !editor || writing.current || blocked || readOnly || !state.is_current) return;
    if (!pending.current) {
      const op = operation || editor.kind;
      let extra: Record<string, unknown> = {};
      if (op === 'assign') {
        const time = editor.due ? new Date(editor.due) : null;
        if (time && !Number.isFinite(time.getTime())) { setError('请填写有效的截止时间。'); return; }
        extra = { ownerId: editor.owner || null, dueAt: editor.due === localDate(state.snapshot.due_at) ? state.snapshot.due_at : time?.toISOString() || null };
      }
      if (op === 'deliver') extra.artifacts = editor.artifacts.map(item => ({ kind: item.kind, title: item.title.trim(), notes: item.notes.trim(),
        ...(['content_workflow', 'manual_content_task'].includes(item.kind) ? { referenceId: item.referenceId.trim() } : item.url.trim() ? { url: item.url.trim() } : {}) }));
      if (op === 'accept' || op === 'return') extra.acceptanceChecks = editor.checks.map((met, index) => ({ index, met }));
      pending.current = JSON.stringify({ projectId, actionId, expectedRevision: revision, expectedVersion: editor.version, operation: op, reason: editor.reason.trim(), idempotencyKey: crypto.randomUUID(), ...extra });
    }
    const request = JSON.parse(pending.current) as { expectedVersion: number; operation: string; actionId: string; expectedRevision: number };
    writing.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.current });
      const raw = await response.json();
      if (!response.ok) {
        if (response.status < 500) { pending.current = null; setUncertain(false); if (response.status === 409 || response.status === 403) setConflict(true); }
        throw Error(apiError(raw, response.status === 409 ? '行动版本或相关依据已变化，请关闭后刷新核对。' : '保存结果尚待确认，请重试同一操作。'));
      }
      if (typeof raw.event_id !== 'string' || !/^[a-f0-9]{32}$/.test(raw.event_id) || raw.saved_version !== request.expectedVersion + 1) throw Error('保存回执尚待核对，请重试同一操作。');
      pending.current = null;
      if (!alive.current) return;
      setUncertain(false); setEditor(null); setMessage(`${operationLabels[request.operation] || '操作'}已记录。交付、验收、发布和可见性观察分别管理。`);
      try { await load(); } catch { setState(null); setError('操作已保存，最新状态暂不可读，请刷新执行记录。'); }
    } catch (err) { if (alive.current) { if (pending.current) setUncertain(true); setError(err instanceof Error ? err.message : '保存结果尚待确认，请重试同一操作。'); } }
    finally { writing.current = false; if (alive.current) setBusy(false); }
  };
  const snapshot = state?.snapshot, status = snapshot?.status;
  const historical = readOnly || state?.is_current === false;
  const closed = status === 'accepted' || status === 'cancelled';
  const mutable = !!state && state.can_write && !historical && !blocked && !closed && !loading && !conflict;
  const canExecute = !!state && (state.can_manage || snapshot?.owner?.id === state.actor_id);
  const named = (id: string) => members.find(member => member.id === id)?.name || (id === state?.actor_id ? '当前用户' : `成员 ${id}`);
  const assignMembers = state?.can_manage ? members : members.filter(member => member.id === state?.actor_id);
  const artifactValid = (item: ArtifactInput) => item.title.trim().length >= 5 && (['content_workflow', 'manual_content_task'].includes(item.kind) ? /^[a-zA-Z0-9_-]{1,191}$/.test(item.referenceId.trim()) : item.kind === 'manual_record' ? item.notes.trim().length >= 5 && (!item.url || validUrl(item.url)) : validUrl(item.url));
  const editorValid = !!editor && editor.reason.trim().length >= 5 && (editor.kind !== 'assign' || editor.owner !== (snapshot?.owner?.id || '') || editor.due !== localDate(snapshot?.due_at || null)) && (editor.kind !== 'deliver' || editor.artifacts.length > 0 && editor.artifacts.every(artifactValid)) && (editor.kind !== 'accept' || editor.checks.every(Boolean));
  return <section className="citation-panel citation-pad task-execution" aria-label={`执行与交付 · 修订 ${revision}`}>
    <div className="citation-section-head"><div><small className="execution-eyebrow">EXECUTION · 修订 {revision}</small><h2>执行与交付</h2></div><div className="execution-head-actions">{status && <span className="citation-tag">{statusLabels[status]}</span>}<button type="button" className="dashboard-button dashboard-button--secondary" disabled={lock || loading} onClick={() => void refresh()}>刷新执行记录</button></div></div>
    {error && !editor && <p role="alert" className="citation-notice citation-notice--warning">{error}</p>}{message && <p role="status" className="citation-notice">{message}</p>}
    {conflict && !editor && <p role="alert" className="citation-notice citation-notice--warning">行动、执行版本或权限已变化，请刷新执行记录后重新核对操作。</p>}
    {!state && !error && <p role="status">正在核对本修订的执行与交付记录…</p>}
    {state && snapshot && <>
      <div className="execution-rail" aria-label="执行进度">{(['not_started','preparing_materials','in_progress','delivered','accepted'] as const).map(value => <span key={value} aria-current={status === value ? 'step' : undefined}>{statusLabels[value]}</span>)}</div>
      {historical && <p className="citation-notice">此处仅查看修订 {revision} 的执行记录。旧产物不会自动归到当前任务。</p>}
      {!historical && !state.plan_approval_valid && <p className="citation-notice citation-notice--warning">当前计划尚未批准或相关依据需重核。可以安排负责人、准备材料；开始执行、交付和验收前请先核对并重新批准计划。</p>}
      <dl className="execution-info"><div><dt>负责人</dt><dd>{snapshot.owner ? `${snapshot.owner.name} · ${roleNames[snapshot.owner.role] || '成员'}` : '待安排'}</dd></div><div><dt>截止时间</dt><dd>{date(snapshot.due_at)}</dd></div><div><dt>对应任务</dt><dd>修订 {revision} · 本修订单独执行</dd></div></dl>
      {!historical && <div className="execution-actions">
        <button type="button" className="dashboard-button dashboard-button--secondary" disabled={!mutable || lock || !!memberError || !(state.can_manage || !snapshot.owner || snapshot.owner.id === state.actor_id)} onClick={() => open('assign')}>安排负责人 / 截止时间</button>
        {status === 'not_started' && <button type="button" className="dashboard-button dashboard-button--secondary" disabled={!mutable || lock || !canExecute} onClick={() => open('prepare')}>准备材料</button>}
        {(status === 'not_started' || status === 'preparing_materials') && <button type="button" className="dashboard-button dashboard-button--primary" disabled={!mutable || lock || !canExecute || !snapshot.owner || !state.plan_approval_valid} onClick={() => open('start')}>开始执行</button>}
        {status === 'in_progress' && <button type="button" className="dashboard-button dashboard-button--primary" disabled={!mutable || lock || !canExecute || !state.plan_approval_valid} onClick={() => open('deliver')}>提交交付</button>}
        {status === 'delivered' && <button type="button" className="dashboard-button dashboard-button--primary" disabled={!mutable || lock || !state.can_review || !state.plan_approval_valid} onClick={() => open('accept')}>验收本次交付</button>}
        {!closed && <button type="button" className="dashboard-button dashboard-button--secondary" disabled={!mutable || lock || !canExecute} onClick={() => open('cancel')}>取消执行</button>}
      </div>}
      <p className="citation-muted">负责人和时间独立调整并留痕，不改写任务内容或事实批准。交付、验收、发布和可见性观察分别记录。</p>
      {memberError && <p role="alert">{memberError}</p>}
      <Delivery snapshot={snapshot} />
      <section className="execution-history" aria-label="执行记录"><div className="citation-section-head"><h3>执行记录</h3><small>保存操作人与当时的任务修订</small></div>
        {!events.length && <p className="citation-muted">本修订尚无执行记录。</p>}
        <ol className="execution-timeline">{events.map(row => <li key={row.id}><strong>{operationLabels[row.operation] || '执行记录'}</strong><small>{named(row.actor_id)} · 修订 {revision} · {date(row.created_at)}</small><p>{row.reason}</p>
          {!row.integrity_valid && <p role="alert" className="citation-notice citation-notice--warning">此历史记录完整性校验未通过，请停止使用并核对。</p>}
          <EventDetails snapshot={row.after} />
        </li>)}</ol>
        {next !== null && <button type="button" className="dashboard-button dashboard-button--secondary" disabled={loading} onClick={() => void moreEvents()}>继续读取执行记录</button>}
        {historyError && <p role="alert">{historyError}</p>}
      </section>
    </>}
    {editor && <ReadingDrawer title={`${editor.kind === 'accept' ? '按原标准验收交付' : operationLabels[editor.kind]} · 修订 ${revision}`} eyebrow="行动执行" closeLabel="关闭执行操作" onClose={() => { if (!lock) { setEditor(null); setError(''); } }}>
      {editor.kind === 'assign' && <p className="citation-muted">安排仅作用于本修订，保存后保留原计划与事实批准。</p>}
      {editor.kind === 'deliver' && <p className="citation-notice">交付绑定当前任务修订。外部地址和核实记录按人工登记；ContentOS产物需核对实际完成记录，不自动视为已交付。</p>}
      {editor.kind === 'accept' && <p className="citation-notice">按本修订原有标准核对交付。验收通过只代表交付达到要求，发布和后续观察另行登记。</p>}
      <fieldset className="execution-editor" disabled={lock || conflict || blocked}>
        {editor.kind === 'assign' && <><label className="task-field">负责人<select className="dashboard-input" value={editor.owner} onChange={event => setEditor({ ...editor, owner: event.target.value })}><option value="">暂不安排</option>{assignMembers.map(member => <option value={member.id} key={member.id}>{member.name} · {roleNames[member.role] || '成员'}</option>)}{editor.owner && !assignMembers.some(member => member.id === editor.owner) && <option value={editor.owner}>原负责人当前不可用，请重新安排</option>}</select></label><label className="task-field">截止时间<input className="dashboard-input" type="datetime-local" value={editor.due} onChange={event => setEditor({ ...editor, due: event.target.value })} /></label></>}
        {editor.kind === 'deliver' && <>{editor.artifacts.map((item, index) => <section className="execution-artifact-editor" key={item.key} aria-label={`交付资料 ${index + 1}`}><div className="citation-section-head"><h3>交付资料 {index + 1}</h3>{editor.artifacts.length > 1 && <button type="button" className="dashboard-button dashboard-button--secondary" onClick={() => setEditor({ ...editor, artifacts: editor.artifacts.filter(row => row.key !== item.key) })}>移除此项</button>}</div>
          {(() => { const update = (values: Partial<ArtifactInput>) => setEditor({ ...editor, artifacts: editor.artifacts.map(row => row.key === item.key ? { ...row, ...values } : row) }); return <><label className="task-field">交付类型<select className="dashboard-input" value={item.kind} onChange={event => update({ kind: event.target.value as ArtifactInput['kind'], url: '', referenceId: '' })}>{artifactKinds.map(kind => <option key={kind} value={kind}>{artifactLabels[kind]} · {kind.startsWith('content_') || kind === 'manual_content_task' ? '核对服务记录' : '人工登记'}</option>)}</select></label><label className="task-field">交付标题<input className="dashboard-input" value={item.title} maxLength={200} onChange={event => update({ title: event.target.value })} /></label>
            {['content_workflow', 'manual_content_task'].includes(item.kind) ? <label className="task-field">ContentOS 任务编号<input className="dashboard-input" value={item.referenceId} maxLength={191} onChange={event => update({ referenceId: event.target.value })} /></label> : <label className="task-field">{item.kind === 'manual_record' ? '交付地址（可选）' : '交付地址'}<input className="dashboard-input" type="url" value={item.url} maxLength={4096} onChange={event => update({ url: event.target.value })} /></label>}
            <label className="task-field">{item.kind === 'manual_record' ? '核实记录（至少5字）' : '资料说明（可选）'}<textarea className="dashboard-input" value={item.notes} maxLength={2000} onChange={event => update({ notes: event.target.value })} /></label></>; })()}
        </section>)}<button type="button" className="dashboard-button dashboard-button--secondary" disabled={editor.artifacts.length >= 10} onClick={() => setEditor({ ...editor, artifacts: [...editor.artifacts, { key: crypto.randomUUID(), kind: 'external_url', title: '', url: '', referenceId: '', notes: '' }] })}>添加交付资料</button></>}
        {editor.kind === 'accept' && pack.acceptance.map((criterion, index) => <label className="execution-criterion" key={index}><input type="checkbox" checked={editor.checks[index]} onChange={event => setEditor({ ...editor, checks: editor.checks.map((value, position) => position === index ? event.target.checked : value) })} /><span>{criterion}</span></label>)}
        <label className="task-field">操作依据<textarea className="dashboard-input" value={editor.reason} maxLength={2000} onChange={event => setEditor({ ...editor, reason: event.target.value })} placeholder="说明本次安排、交付或验收的依据（至少5字）" /></label>
        <div className="execution-actions">{editor.kind === 'accept' && <button type="button" className="dashboard-button dashboard-button--secondary" disabled={editor.reason.trim().length < 5} onClick={() => void send('return')}>退回修改</button>}<button type="button" className="dashboard-button dashboard-button--primary" disabled={!editorValid} onClick={() => void send()}>{({ assign: '保存安排', prepare: '记录材料准备', start: '确认开始执行', deliver: '提交交付，等待验收', accept: '确认验收通过', cancel: '确认取消执行', return: '退回修改' })[editor.kind]}</button></div>
      </fieldset>
      {error && <p role="alert" className="citation-notice citation-notice--warning">{error}</p>}
      {conflict && <p role="alert">行动、执行版本或依据已变化。本次填写没有覆盖新版本，请关闭后刷新记录，再核对操作。</p>}
      {uncertain && <button type="button" className="dashboard-button dashboard-button--secondary" disabled={busy || blocked} onClick={() => void send()}>重试同一执行操作</button>}
      {busy && <p role="status">正在保存本修订的执行记录…</p>}
    </ReadingDrawer>}
  </section>;
}
