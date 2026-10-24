"use client";

import { useEffect, useRef, useState } from 'react';
import type { EvidenceRun } from '@/types/intelligence';

type Decision = 'eligible' | 'excluded' | 'needs_review';
interface Cohort { hash: string; cells: Array<{ prompt_hash: string; prompt: string; category: string; eligibility: string; eligibility_reason: string }> }
interface ReviewState { base: Cohort | null; cohort: Cohort | null; latest_cohort?: Cohort | null; latest_review_version: number }

export function EvaluationCohortReview({ projectId, run, onSaved }: { projectId: string; run: EvidenceRun; onSaved: () => void }) {
  const [state, setState] = useState<ReviewState | null>(null), [decisions, setDecisions] = useState<Record<string, Decision | ''>>({});
  const [reason, setReason] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const pending = useRef<string | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, runId: run.id, view: 'evaluationCohort' })}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw Error(); return response.json() as Promise<ReviewState>; })
      .then(data => { if (controller.signal.aborted) return; setState(data); setDecisions(Object.fromEntries((data.latest_cohort?.cells || data.cohort?.cells || data.base?.cells || []).map(cell => [cell.prompt_hash, ['eligible', 'excluded', 'needs_review'].includes(cell.eligibility) ? cell.eligibility as Decision : '']))); })
      .catch(() => { if (!controller.signal.aborted) setError('问题范围读取失败，请关闭后重新打开。'); });
    return () => { live.current = false; controller.abort(); };
  }, [projectId, run.id]);
  const prompts = [...new Map((state?.base?.cells || []).map(cell => [cell.prompt_hash, cell])).values()];
  const submit = async () => {
    if (!state?.base || busy || message) return;
    if (!pending.current) {
      if (reason.trim().length < 5 || prompts.some(cell => !decisions[cell.prompt_hash])) { setError('请逐项确认问题资格，并填写至少 5 个字的审核依据。'); return; }
      pending.current = JSON.stringify({ action: 'reviewEvaluationCohort', projectId, runId: run.id, baseHash: state.base.hash, decisions, reason: reason.trim(), expectedVersion: state.latest_review_version, idempotencyKey: crypto.randomUUID() });
    }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.current });
      if (!live.current) return;
      if (!response.ok) {
        if ([400, 401, 403, 409, 422].includes(response.status)) { pending.current = null; setUncertain(false); setError(response.status === 409 ? '审核版本已变化，请关闭后重新打开并核对最新范围。' : '审核未保存，请检查权限和问题选择。'); return; }
        throw Error();
      }
      pending.current = null; setUncertain(false); setMessage('审核已保存，等待新分析修订。当前修订的评分和问题分母保留。'); onSaved();
    } catch { if (live.current) { setUncertain(true); setError('尚未确认保存结果，请使用相同请求重试；不会重复提交不同版本。'); } }
    finally { if (live.current) setBusy(false); }
  };
  return <section className="space-y-4" aria-label="问题资格审核"><p className="citation-muted">逐条核对中性选型范围。品牌定向问题保留在材料中，不能进入竞争总分；保存后生成新修订。</p>
    {!state && !error && <p role="status">正在读取冻结问题…</p>}
    {state && !state.base && <p>本修订没有已冻结的竞争评价问题集。</p>}
    {state && <p className="citation-muted">当前审核决定版本：{state.latest_review_version}。暂不确定的问题保留原权重，不发布相应竞争总分。</p>}
    <fieldset disabled={busy || uncertain || !!message} className="space-y-4">{prompts.map((cell, index) => <div key={cell.prompt_hash} className="citation-panel citation-pad"><label className="block" htmlFor={`prompt-review-${index}`}>{cell.prompt}</label><small className="citation-muted">原分类：{cell.category} · {cell.eligibility === 'excluded' ? '预设登记品牌，固定排除' : '需要人工核对中性范围'}</small><select id={`prompt-review-${index}`} className="dashboard-select mt-3 w-full" value={decisions[cell.prompt_hash] || ''} disabled={cell.eligibility === 'excluded'} onChange={event => setDecisions(current => ({ ...current, [cell.prompt_hash]: event.target.value as Decision | '' }))}><option value="">请选择判断</option><option value="eligible">纳入中性竞争评价</option><option value="excluded">排除本次竞争评价</option><option value="needs_review">暂不确定，保留待审核</option></select></div>)}
      {!!prompts.length && <label className="block">审核依据<textarea className="dashboard-input mt-2 min-h-28 w-full" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>}
    </fieldset>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!!prompts.length && !message && <button type="button" className="dashboard-button dashboard-button--primary" disabled={busy || !['ready', 'partial', 'failed'].includes(run.status)} onClick={submit}>{busy ? '保存中…' : uncertain ? '使用相同请求重试' : '保存范围审核'}</button>}
  </section>;
}
