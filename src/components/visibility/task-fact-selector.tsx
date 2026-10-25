"use client";
import { useEffect, useState } from 'react';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import type { TaskPlan } from '@/lib/visibility/task-contract';
import { loadEligibleFacts, type FactCollection } from '@/lib/visibility/fact-reader';

const statuses: Record<string, string> = { valid: '可选择 · 需核对任务适用性', superseded: '已有新版本', withdrawn: '已撤回', expired: '已过期', scheduled: '尚未生效', needs_review: '来源需重新核实', missing: '事实不可用' };
const date = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '未记录';
export function TaskFactSelector({ projectId, plan, locked, conflict, error, uncertain, onClose, onSave, onRetry }: {
  projectId: string; plan: TaskPlan; locked: boolean; conflict: boolean; error: string; uncertain: boolean;
  onClose: () => void; onSave: (ids: string[], reason: string) => void; onRetry: () => void;
}) {
  const [collection, setCollection] = useState<FactCollection | null>(null), [failure, setFailure] = useState('');
  const original = plan.target.task_pack?.own_fact_ids || [];
  const [ids, setIds] = useState<string[]>([...original]), [reason, setReason] = useState(''), [reviewed, setReviewed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    loadEligibleFacts(projectId, plan.id, plan.revision, plan.revision_id, abort.signal).then(value => { if (!abort.signal.aborted) setCollection(value); })
      .catch(err => { if (!abort.signal.aborted) setFailure(err.message); });
    return () => abort.abort();
  }, [projectId, plan.id, plan.revision, plan.revision_id]);
  const changed = JSON.stringify(ids) !== JSON.stringify(original);
  const invalidSelected = !!collection && ids.some(id => !collection.items.some(row => row.id === id && row.eligible));
  const disabled = locked || conflict || collection?.can_write === false;
  return <ReadingDrawer title={`选择我方事实 · 行动修订 ${plan.revision}`} variant="modal" closeLabel="关闭事实选择" onClose={onClose}>
    <p className="citation-muted">核对来源、版本、有效期和适用范围。相同品牌的事实未必适合本任务；保存会创建新修订，原批准及产物保留。</p>
    {!collection && !failure && <p role="status">正在核对当前事实资格…</p>}
    {failure && <p role="alert" className="citation-notice citation-notice--warning">{failure}</p>}
    {collection && <fieldset disabled={disabled} className="citation-stack task-fact-list"><legend>共 {collection.total} 条事实 · 已选 {ids.length} 条</legend>
      {!collection.items.length && <p className="citation-notice">当前没有该自有品牌的可用事实。请先补齐并核实我方材料，再回到本任务选择。</p>}
      {collection.items.map(row => <label className={`task-fact-option${row.eligible ? '' : ' task-fact-option--blocked'}`} key={row.id}>
        <input type="checkbox" checked={ids.includes(row.id)} disabled={!row.eligible && !ids.includes(row.id)} onChange={event => { setReviewed(false); setIds(previous => event.target.checked ? [...previous, row.id] : previous.filter(id => id !== row.id)); }} />
        <span className="task-fact-body"><span className="task-chip-row"><b>{row.source_ref?.kind === 'owned_asset_revision' ? '我方材料' : row.source_ref?.kind === 'citation_review' ? '已审核引用' : '原选事实'}</b><small>{row.version ? `版本 ${row.version}` : ''}</small><span className="citation-tag">{row.eligibility_reason === 'own_target_mismatch' ? '品牌归属不匹配' : statuses[row.status] || '当前不可用'}</span></span>
          <strong>{row.statement || '原事实已不可用，请移除后重新核对'}</strong><span className="task-fact-scope">仅适用：{row.scope || '当前无法读取'}</span>
          <small>有效期：{date(row.valid_from)} 至 {date(row.valid_until)}</small>
          {row.source_ref && <small>来源：{row.source_ref.kind === 'owned_asset_revision' ? `材料 ${row.source_ref.asset_id} · 材料修订 ${row.source_ref.asset_revision}` : `引用 ${row.source_ref.citation_id} · 快照 ${row.source_ref.snapshot_id}`}<br />原文：“{row.source_ref.evidence.quote}”</small>}
        </span>
      </label>)}
      <label className="task-fact-choice"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />已逐条核对所选事实适用于本任务的问题、品牌和范围；系统资格检查不代表自动证明其适用性。</label>
      <label className="task-field">本次事实选择依据<textarea className="dashboard-input" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="说明选用或移除事实的原因（至少5字）" /></label>
      {invalidSelected && <p role="alert">有已选事实失效或不属于本品牌，请先移除。</p>}
      <button type="button" className="dashboard-button dashboard-button--primary" disabled={!changed || !reviewed || reason.trim().length < 5 || invalidSelected || ids.length > 100} onClick={() => onSave(ids, reason)}>保存新修订，重新审核</button>
      {!changed && <p className="citation-muted">选择没有变化，无需创建新修订。</p>}
    </fieldset>}
    {conflict && <p role="alert" className="citation-notice citation-notice--warning">行动版本或依据已变化，本次选择未套用到新版本。请关闭后核对最新任务，再重新选择。</p>}
    {error && <p role="alert">{error}</p>}{uncertain && <button type="button" disabled={locked && !uncertain} onClick={onRetry}>重试同一保存操作</button>}
  </ReadingDrawer>;
}
