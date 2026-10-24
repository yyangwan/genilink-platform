"use client";

import { useEffect, useRef, useState } from 'react';
import type { EvidenceRun } from '@/types/intelligence';
import { SCENARIOS, type Scenario } from '@/lib/visibility/scenarios';
import { quoteSpans, type PromptSpan, type QuestionReview } from '@/lib/visibility/question-context';

type Decision = 'eligible' | 'excluded' | 'needs_review';
interface SavedReview { status: 'confirmed' | 'needs_review'; primary_scenario: Scenario | null; secondary_scenarios: Scenario[]; brand_scope: QuestionReview['brandScope']; brand_references: PromptSpan[]; requirements: PromptSpan[]; intent?: string | null; audience?: PromptSpan[]; usage_context?: PromptSpan[]; constraints?: PromptSpan[] }
interface Cell { prompt_hash: string; prompt: string; category: string; eligibility: string; eligibility_reason: string; question_context?: { scenarios: Array<{ scenario: Scenario }>; registered_references: Array<PromptSpan & { screen: string }>; review: SavedReview | null } }
interface Cohort { hash: string; cells: Cell[] }
interface ReviewState { base: Cohort | null; cohort: Cohort | null; latest_cohort?: Cohort | null; latest_review_version: number }
interface Fields { primary: Scenario | ''; brand: QuestionReview['brandScope']; references: string; requirements: string; saved?: SavedReview | null }

export function EvaluationCohortReview({ projectId, run, onSaved }: { projectId: string; run: EvidenceRun; onSaved: () => void }) {
  const [state, setState] = useState<ReviewState | null>(null), [decisions, setDecisions] = useState<Record<string, Decision | ''>>({}), [fields, setFields] = useState<Record<string, Fields>>({});
  const [reason, setReason] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const pending = useRef<string | null>(null), live = useRef(true);
  useEffect(() => {
    live.current = true;
    const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, runId: run.id, view: 'evaluationCohort' })}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw Error(); return response.json() as Promise<ReviewState>; })
      .then(data => {
        if (controller.signal.aborted) return;
        setState(data);
        const cells = data.latest_cohort?.cells || data.cohort?.cells || data.base?.cells || [];
        setDecisions(Object.fromEntries(cells.map(cell => [cell.prompt_hash, ['eligible', 'excluded', 'needs_review'].includes(cell.eligibility) ? cell.eligibility as Decision : ''])));
        setFields(Object.fromEntries(cells.map(cell => { const saved = cell.question_context?.review; return [cell.prompt_hash, { primary: saved?.primary_scenario || '', brand: saved?.brand_scope || (cell.eligibility === 'excluded' ? 'directed' : 'uncertain'), references: (saved?.brand_references || cell.question_context?.registered_references || []).map(row => row.quote).join('\n'), requirements: (saved?.requirements || []).map(row => row.quote).join('\n'), saved }]; })));
      }).catch(() => { if (!controller.signal.aborted) setError('问题范围读取失败，请关闭后重新打开。'); });
    return () => { live.current = false; controller.abort(); };
  }, [projectId, run.id]);
  const prompts = [...new Map((state?.base?.cells || []).map(cell => [cell.prompt_hash, cell])).values()];
  const update = (hash: string, value: Partial<Fields>) => setFields(current => ({ ...current, [hash]: { ...current[hash], ...value } }));
  const submit = async () => {
    if (!state?.base || busy || message) return;
    if (!pending.current) {
      if (Array.from(reason.trim()).length < 5 || prompts.some(cell => !decisions[cell.prompt_hash])) { setError('请逐项确认问题资格，并填写至少 5 个字的审核依据。'); return; }
      const contexts: Record<string, QuestionReview> = {};
      try {
        for (const cell of prompts) {
          const field = fields[cell.prompt_hash], decision = decisions[cell.prompt_hash];
          if (!field || decision === 'eligible' && (!field.primary || field.brand !== 'neutral')) throw Error('纳入中性评价的问题需要确认主场景及中性指向。');
          if (field.brand === 'uncertain' && decision !== 'needs_review') throw Error('名称不确定的问题请保留待审核。');
          if (field.brand === 'directed' && decision === 'eligible') throw Error('品牌定向问题不能纳入中性竞争评价。');
          const references = field.brand === 'directed' ? quoteSpans(cell.prompt, field.references) : [];
          if (field.brand === 'directed' && !references.length) throw Error('请逐字填写问题中指定的品牌或产品。');
          contexts[cell.prompt_hash] = { status: field.primary && field.brand !== 'uncertain' ? 'confirmed' : 'needs_review', primaryScenario: field.primary || null, secondaryScenarios: (field.saved?.secondary_scenarios || []).filter(key => key !== field.primary), brandScope: field.brand, brandReferences: references, requirements: quoteSpans(cell.prompt, field.requirements), intent: field.saved?.intent, audience: field.saved?.audience || [], usageContext: field.saved?.usage_context || [], constraints: field.saved?.constraints || [] };
        }
      } catch (error) { setError(error instanceof Error ? error.message : '请检查场景审核内容'); return; }
      pending.current = JSON.stringify({ action: 'reviewEvaluationCohort', projectId, runId: run.id, baseHash: state.base.hash, decisions, contexts, reason: reason.trim(), expectedVersion: state.latest_review_version, idempotencyKey: crypto.randomUUID() });
    }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: pending.current });
      if (!live.current) return;
      if (!response.ok) {
        if ([400, 401, 403, 409, 422].includes(response.status)) { pending.current = null; setUncertain(false); setError(response.status === 409 ? '审核版本已变化，请关闭后重新打开并核对最新范围。' : '审核未保存，请检查权限、主场景和原文。'); return; }
        throw Error();
      }
      pending.current = null; setUncertain(false); setMessage('审核已保存，等待新分析修订。当前修订的评分和问题分母保留。'); onSaved();
    } catch { if (live.current) { setUncertain(true); setError('尚未确认保存结果，请使用相同请求重试；不会重复提交不同版本。'); } }
    finally { if (live.current) setBusy(false); }
  };
  return <section className="space-y-4" aria-label="问题资格审核"><p className="citation-muted">系统建议只作核对提示。确认每题的主场景和问题指向；不重复采集。</p>
    {!state && !error && <p role="status">正在读取冻结问题…</p>}
    {state && !state.base && <p>本修订没有已冻结的竞争评价问题集。</p>}
    {state && <p className="citation-muted">当前审核决定版本：{state.latest_review_version}。暂不确定的问题保留原权重；场景建议未经确认不参与场景比较。</p>}
    <fieldset disabled={busy || uncertain || !!message} className="space-y-4">{prompts.map((cell, index) => { const field = fields[cell.prompt_hash]; return <div key={cell.prompt_hash} className="citation-panel citation-pad">
      <h3>{index + 1}. {cell.prompt}</h3><p className="citation-muted text-sm">原分类：{cell.category} · 系统建议：{cell.question_context?.scenarios.map(row => SCENARIOS[row.scenario]).join(' / ') || '需要核对'}（未确认）</p>
      {cell.eligibility_reason === 'registered_name_ambiguous' && <p className="citation-muted">登记名称在本题可能是普通用语，请结合原文核对。</p>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="block mt-3" htmlFor={`prompt-review-${index}`}>竞争评价资格<span className="sr-only">：{cell.prompt}</span><select id={`prompt-review-${index}`} aria-label={cell.prompt} className="audit-select mt-2 w-full" value={decisions[cell.prompt_hash] || ''} disabled={cell.eligibility === 'excluded'} onChange={event => setDecisions(current => ({ ...current, [cell.prompt_hash]: event.target.value as Decision | '' }))}><option value="">请选择判断</option><option value="eligible">纳入中性竞争评价</option><option value="excluded">排除本次竞争评价</option><option value="needs_review">暂不确定，保留待审核</option></select></label>
      <label className="block mt-3">本题主场景<select aria-label={`第${index + 1}题主场景`} className="audit-select mt-2 w-full" value={field?.primary || ''} onChange={event => update(cell.prompt_hash, { primary: event.target.value as Scenario | '' })}><option value="">请选择主场景</option>{Object.entries(SCENARIOS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label></div>
      <p className="citation-muted text-sm mt-2">只按主场景聚合，附加标签不重复计数。</p>
      <label className="block mt-3">问题指向<select aria-label={`第${index + 1}题问题指向`} className="audit-select mt-2 w-full" value={field?.brand || 'uncertain'} onChange={event => update(cell.prompt_hash, { brand: event.target.value as Fields['brand'] })}><option value="neutral">中性选型，不预设品牌</option><option value="directed">指定品牌或产品</option><option value="uncertain">名称有歧义，保留待核实</option></select></label>
      {field?.brand === 'directed' && <label className="block mt-3">指定品牌原文<input aria-label={`第${index + 1}题指定品牌原文`} className="dashboard-input mt-2 w-full" value={field.references} maxLength={2000} onChange={event => update(cell.prompt_hash, { references: event.target.value })} /></label>}
      <details className="mt-3"><summary className="citation-text-action">核对需求原文（可选）</summary><label className="block mt-3">需要关注的原文<textarea aria-label={`第${index + 1}题需求原文`} className="dashboard-input mt-2 min-h-24 w-full" maxLength={8000} placeholder="逐字引用问题中的需求或限制，一行一条" value={field?.requirements || ''} onChange={event => update(cell.prompt_hash, { requirements: event.target.value })} /></label><p className="citation-muted text-sm">只引用原问题，避免把回答或我方资料补进需求。</p></details>
    </div>; })}
      {!!prompts.length && <label className="block">审核依据<textarea className="dashboard-input mt-2 min-h-28 w-full" maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></label>}
    </fieldset>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!!prompts.length && !message && <button type="button" className="dashboard-button dashboard-button--primary" disabled={busy || !['ready', 'partial', 'failed'].includes(run.status)} onClick={submit}>{busy ? '保存中…' : uncertain ? '使用相同请求重试' : '保存范围审核'}</button>}
  </section>;
}
