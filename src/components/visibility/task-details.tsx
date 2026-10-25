"use client";

import { useEffect, useState } from 'react';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import type { EvidenceReference, TaskOpportunity, TaskPack, RevisionChanges, DependencyChange } from '@/lib/visibility/task-contract';
import { channels, dimensions, scenarioName, safeHttp, dependencyName, readableValue, taskFieldName } from '@/lib/visibility/task-view';

export function TaskDelivery({ pack, onEvidence }: { pack: TaskPack; onEvidence: (ref: EvidenceReference) => void }) {
  const [allEvidence, setAllEvidence] = useState(false);
  return <div className="citation-stack">
    <section><h3>具体交付</h3><p className="task-deliverable">{pack.deliverable}</p><dl className="task-kv">
      <div><dt>修改对象</dt><dd>{pack.delivery.asset_title} · {pack.delivery.asset_kind === 'existing_material' ? `材料版本 ${pack.delivery.material_version}` : '新交付物'}</dd></div>
      <div><dt>目标客户</dt><dd>{pack.delivery.audience_status === 'reviewed_prompt' ? pack.delivery.audience.join('、') || '原问题未指定具体客户' : '原问题未确认目标客户，需核对'}</dd></div>
      <div><dt>交付渠道</dt><dd>{channels[pack.delivery.channel]}<p className="citation-muted">{pack.delivery.channel_reason}</p></dd></div>
      {safeHttp(pack.delivery.reference_url) && <div><dt>材料地址</dt><dd><a className="citation-link" href={pack.delivery.reference_url!} target="_blank" rel="noopener noreferrer">打开登记材料 ↗</a></dd></div>}
    </dl><h4>交付提纲</h4><ol className="task-list">{pack.delivery.outline.map((text, index) => <li key={index}>{text}</li>)}</ol>
      <h4>验收标准</h4><ul className="task-list">{pack.acceptance.map((text, index) => <li key={index}>{text}</li>)}</ul>
    </section>
    <section><h3>平台子目标与原问题</h3><p className="citation-muted">筛选只用于定位；任务始终保留以下全部目标，不把平台差异合并成一个结论。</p>
      {pack.ai_targets.map(target => <div className="task-subtarget" key={[target.platform, target.prompt_hash, target.scenario_id].join(':')}>
        <div className="task-chip-row"><AiPlatformLabel platform={target.platform} /><span className="citation-tag">{scenarioName(target.scenario_id)}</span></div>
        <p>{pack.delivery.questions.find(row => row.prompt_hash === target.prompt_hash)?.text || '原问题记录缺失，请重新核对'}</p>
        <small>观察维度：{target.dimensions.map(value => dimensions[value]).join('、')}</small>
      </div>)}
    </section>
    <section><h3>诊断原文依据 · {pack.diagnostic_evidence.length} 条</h3>{(allEvidence ? pack.diagnostic_evidence : pack.diagnostic_evidence.slice(0, 3)).map((ref, index) => <EvidenceCard key={index} reference={ref} onOpen={onEvidence} />)}
      {!allEvidence && pack.diagnostic_evidence.length > 3 && <button type="button" className="citation-link" onClick={() => setAllEvidence(true)}>展开其余 {pack.diagnostic_evidence.length - 3} 条证据 →</button>}</section>
    <section><h3>我方事实与材料需求</h3><p>{pack.own_fact_ids.length ? `本版本选择 ${pack.own_fact_ids.length} 条我方事实；仍须逐条核对其适用范围，不能直接当作内容结论。` : '本版本尚未选择合资格的我方事实，可以先开展材料核实。'}</p>
      {pack.missing_materials.length > 0 && <ul className="task-list">{pack.missing_materials.map((row, index) => <li key={index}>{row}</li>)}</ul>}
      <p className="citation-muted">材料需求保留本版本要求；补齐材料后重新核对。资料缺失不代表产品没有该能力。</p>
    </section>
  </div>;
}

export function EvidenceCard({ reference, onOpen }: { reference: EvidenceReference; onOpen: (ref: EvidenceReference) => void }) {
  return <div className="task-evidence"><small>{reference.owner_kind === 'answer' ? '平台回答' : reference.owner_kind === 'snapshot' ? '保存的来源正文' : '来源摘要'}</small>
    <blockquote>{reference.quote}</blockquote><button type="button" className="citation-link" onClick={() => onOpen(reference)}>定位保存原文 →</button></div>;
}

export function OpportunityEvidence({ row, onEvidence }: { row: TaskOpportunity; onEvidence: (ref: EvidenceReference) => void }) {
  return <div className="citation-stack"><section><h3>本次观察</h3>{row.observed_facts.map((value, index) => <p key={index}>{value}</p>)}</section>
    <section className="task-assumption"><h3>原因假设与限制</h3>{row.hypotheses.length ? row.hypotheses.map((value, index) => <p key={index}>{value}</p>) : <p>尚未建立原因解释，先核对观察与原文。</p>}
      {row.unknowns.map((value, index) => <p key={index}>{value}</p>)}</section>
    {!!row.counterevidence.length && <section><h3>反向证据与其他平台条件</h3>{row.counterevidence.map((ref, index) => <EvidenceCard key={index} reference={ref} onOpen={onEvidence} />)}</section>}
    {!!row.subtargets.length && <details className="task-history"><summary>逐次观察与采集条件 · {row.subtargets.length} 条</summary>{row.subtargets.map((child, index) => <div className="task-subtarget" key={index}>
      <AiPlatformLabel platform={child.platform} /><p>{child.finding}</p><small>{scenarioName(child.scenario_id)} · {child.observation_kind === 'answer_reference' ? '实际引用观察' : child.observation_kind === 'search_candidate' ? '搜索候选观察' : child.observation_kind === 'text_link' ? '文本链接观察' : '回答或保存文字观察'}</small>
      <p className="citation-muted">{Object.entries(child.conditions).filter(([key, value]) => ['searchMode', 'search_mode', 'modelVersion', 'model_version', 'location', 'accountClass', 'account_class'].includes(key) && value != null && value !== 'unknown').map(([key, value]) => `${({ searchMode: '搜索条件', search_mode: '搜索条件', modelVersion: '模型版本', model_version: '模型版本', location: '地域', accountClass: '账号条件', account_class: '账号条件' } as Record<string, string>)[key]}：${readableValue(value)}`).join(' · ') || '相关采集条件未完整记录，不能归因为平台固定偏好。'}</p>
    </div>)}</details>}
    {!!row.excluded_scopes.length && <section><h3>不进入执行目标的范围</h3>{row.excluded_scopes.map((child, index) => <p key={index}><AiPlatformLabel platform={child.platform} /> · {child.finding}</p>)}</section>}
  </div>;
}

export function DependencyDifferences({ changes }: { changes: DependencyChange[] }) {
  return <div className="task-differences">{changes.map((row, index) => <details key={index}><summary>{dependencyName(row.dependency)}发生变化</summary>
    <div className="task-diff-pair"><div><small>原版本依据</small><p>{readableValue(row.before)}</p></div><div><small>当前依据</small><p>{readableValue(row.after)}</p></div></div>
  </details>)}</div>;
}
export function RevisionDifferences({ changes }: { changes: RevisionChanges }) {
  return <><div className="task-differences">{changes.task.map((row, index) => <details key={index}><summary>{taskFieldName(row.field)}</summary>
    <div className="task-diff-pair"><div><small>修订前</small><p>{readableValue(row.before)}</p></div><div><small>修订后</small><p>{readableValue(row.after)}</p></div></div></details>)}</div>
    <DependencyDifferences changes={changes.dependencies} />{!changes.task.length && !changes.dependencies.length && <p className="citation-muted">首次保存的任务版本。</p>}</>;
}

export type EvidenceReadTarget = Omit<EvidenceReference, 'text_hash'>;
export function EvidenceReading({ reference, projectId, onClose, context = 'task' }: { reference: EvidenceReadTarget; projectId: string; onClose: () => void; context?: 'task' | 'source' }) {
  const [result, setResult] = useState<{ text: string; start: number } | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      let offset: number | null = 0;
      const seen = new Set<number>();
      while (offset !== null && !seen.has(offset)) {
        seen.add(offset);
        const response = await fetch('/api/integration/intelligence?' + new URLSearchParams({ projectId, view: 'content', runId: reference.run_id || '', ownerKind: reference.owner_kind, ownerId: reference.owner_id, offset: String(offset) }), { signal: abort.signal, cache: 'no-store' });
        if (!response.ok) throw Error('保存原文暂不可读；下方冻结摘录仍保留，请稍后重试。');
        const page = await response.json() as { items: Array<{ id: string; start: number; end: number; text: string }>; next_offset: number | null };
        const row = page.items.find(row => row.id === reference.segment_id);
        if (row) {
          const text = Array.from(row.text);
          if (reference.start < row.start || reference.end > row.end || text.slice(reference.start - row.start, reference.end - row.start).join('') !== reference.quote) throw Error('当前保存片段与冻结摘录不一致，请核对版本后重新分析。');
          if (!abort.signal.aborted) setResult({ text: row.text, start: row.start });
          return;
        }
        offset = page.next_offset;
      }
      throw Error('本分析版本没有对应的原文片段，请核对任务依据。');
    })().catch(err => { if (!abort.signal.aborted) setError(err.message); });
    return () => abort.abort();
  }, [projectId, reference]);
  const chars = Array.from(result?.text || ''), begin = reference.start - (result?.start || 0), end = reference.end - (result?.start || 0);
  return <ReadingDrawer title={context === 'source' ? '观点核验 · 保存原文' : '任务依据 · 保存原文'} onClose={onClose} closeLabel={context === 'source' ? '关闭核验原文' : '关闭任务原文'}>
    {error ? <p role="alert" className="citation-notice citation-notice--warning">{error}</p> : !result ? <p role="status">正在定位原文片段…</p> : <blockquote className="task-original">{chars.slice(0, begin).join('')}<mark>{chars.slice(begin, end).join('')}</mark>{chars.slice(end).join('')}</blockquote>}
    <h3>{context === 'source' ? '本次核验冻结的原文摘录' : '本任务冻结的原文摘录'}</h3><blockquote className="task-original">{reference.quote}</blockquote><p className="citation-muted">保留原分析版本与真实来源，不因切换品牌或平台改写引文。</p>
  </ReadingDrawer>;
}
