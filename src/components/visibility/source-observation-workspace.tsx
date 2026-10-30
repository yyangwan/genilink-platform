"use client";

import { useEffect, useMemo, useState } from 'react';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import { completeness, groupSources, loadSourceObservations, readableSnapshot, sourceKind, type ArticleGroup, type SourceObservation, type SourcePage } from '@/lib/visibility/source-observation';
import type { EvidenceRun } from '@/types/intelligence';
import type { TaskScope } from '@/lib/visibility/task-view';
import { scopeResponseIds } from '@/lib/visibility/analysis-scope';
import { EvidenceReading, type EvidenceReadTarget } from './task-details';
import './source-observations.css';

export type SourceLibraryProps = {
  run: EvidenceRun; projectId?: string;
  scope?: TaskScope;
  onOpenAnswer: (id: string, runId?: string) => void;
  onOpenSource: (id: string, title: string, runId?: string) => void;
  onRetry: (documentId: string) => void; retrying: string | null;
};

export function ObservedSourceLibrary(props: SourceLibraryProps) {
  return <SourceObservations key={[props.projectId, props.run.id, props.run.status, props.scope?.platform, props.scope?.scenario].join(':')} {...props} />;
}

function SourceObservations({ run, projectId, onOpenAnswer, onOpenSource, onRetry, retrying, scope }: SourceLibraryProps) {
  const [page, setPage] = useState<SourcePage | null>(null), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [filter, setFilter] = useState({ query: '', status: 'all', platform: '' }), [limit, setLimit] = useState(20);
  const [selected, setSelected] = useState<string | null>(null), [reading, setReading] = useState<EvidenceReadTarget | null>(null);
  useEffect(() => {
    if (!projectId) return;
    const abort = new AbortController();
    loadSourceObservations(projectId, run.id, abort.signal).then(value => { if (!abort.signal.aborted) setPage(value); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [projectId, run.id, reload]);
  const rows = useMemo(() => {
    const ids = scope ? scopeResponseIds(run, scope) : null;
    return (page?.items || []).filter(row => !scope || (!scope.platform || row.platform === scope.platform) && (scope.scenario === 'all' || ids!.has(row.response_id)));
  }, [page, run, scope]);
  const groups = useMemo(() => groupSources(rows, filter), [rows, filter]);
  const all = useMemo(() => groupSources(rows, { query: '', status: 'all', platform: '' }), [rows]);
  const platforms = [...new Set(rows.map(row => row.platform))];
  const group = groups.find(row => row.key === selected);
  const changeFilter = (key: keyof typeof filter, value: string) => { setFilter({ ...filter, [key]: value }); setLimit(20); setSelected(null); };
  const retryRead = () => { setPage(null); setError(''); setSelected(null); setReading(null); setReload(value => value + 1); };
  if (!projectId) return <p className="citation-notice" role="status">请先选择工作空间，再读取对应审计的来源观察。</p>;
  if (error) return <div className="citation-notice" role="alert">{error}<button type="button" onClick={retryRead}>重新读取 →</button></div>;
  if (!page) return <p className="citation-notice" role="status">正在读取完整来源观察，完成前不显示汇总数量…</p>;
  if (page.status === 'pending') return <div className="citation-notice" role="status">本次分析尚未发布来源观察，不能据此判断没有引用。<button type="button" onClick={retryRead}>重新读取 →</button></div>;
  return <div className="citation-stack source-observation-workspace">
    {scope && <p className="citation-notice">本页保留所选平台与场景的全部来源，不按品牌是否出现筛掉材料；正文发现与回答表现分开核对。另有 {page.items.length - rows.length} 条来源不在当前平台或场景范围内。</p>}
    <div className="citation-stat-grid">
      <SourceStat title="归并文章" value={all.length} detail="按文章标识归并，无标识时分别保留" />
      <SourceStat title="回答实际引用" value={rows.filter(row => row.actual_reference).length} detail="逐次观察计数，候选与文本链接不计入" />
      <SourceStat title="检索候选 / 其他链接" value={rows.filter(row => !row.actual_reference).length} detail="只说明来源出现，不能当作实际引用" />
      <SourceStat title="可回查正文的观察" value={`${rows.filter(readableSnapshot).length} / ${rows.length}`} detail="只读取该次观察绑定的保存版本" />
    </div>
    <section className="citation-panel citation-pad">
      <div className="citation-section-head"><div><h2>按文章归并，按观察追溯</h2><p className="citation-muted">同一文章的每个平台、回答、引用类型与正文版本各自保留。</p></div><span className="citation-tag">正文完整性单列</span></div>
      <div className="citation-filter-row">
        <input aria-label="搜索来源文章" value={filter.query} onChange={event => changeFilter('query', event.target.value)} placeholder="搜索文章标题或地址" />
        {!scope && <select aria-label="筛选来源平台" value={filter.platform} onChange={event => changeFilter('platform', event.target.value)}><option value="">全部平台</option>{platforms.map(name => <option key={name} value={name}>{getAiPlatformLabel(name)}</option>)}</select>}
        <select aria-label="筛选来源状态或类型" value={filter.status} onChange={event => changeFilter('status', event.target.value)}>
          <option value="all">全部状态与类型</option><option value="saved">该次正文可回查</option><option value="unavailable">该次正文未就绪</option><option value="actual">回答实际引用</option><option value="candidate">候选 / 其他链接</option>
        </select><span className="citation-muted">{groups.length} 篇文章 · {groups.reduce((sum, row) => sum + row.entries.length, 0)} 条观察</span>
      </div>
      <div className="overflow-x-auto"><table className="citation-table citation-source-table"><thead><tr><th>文章 / 来源</th><th>各平台观察</th><th>正文状态</th><th>正文发现主体</th><th>关联证据</th></tr></thead><tbody>{groups.slice(0, limit).map(article => <ArticleRow key={article.key} run={run} article={article} onOpen={() => setSelected(article.key)} />)}</tbody></table></div>
      {!groups.length && <p className="citation-empty">{page.items.length ? '当前筛选没有匹配的观察，请调整条件。' : '本次已发布结果没有来源观察；不能据此判断平台或品牌没有相关信息。'}</p>}
      {limit < groups.length && <button type="button" className="citation-link" onClick={() => setLimit(value => value + 20)}>展开后续文章 · 剩余 {groups.length - limit} 篇 →</button>}
      <p className="citation-inspect">筛选条件作用于同一条观察；不借用其他平台的引用类型或正文。正文缺失与未核验段落保持未知。</p>
    </section>
    <section className="citation-panel citation-pad"><div className="citation-section-head"><h3>相似正文与独立证据</h3><span className="citation-tag">发布者独立性未知</span></div>
      <p className="citation-muted">相同正文与近似转载归入内容家族，方便核对重复材料；不能据此确认原创者、发布者独立性或来源权威性。</p>
      <p>{page.content_family_coverage ? `近似比较已处理 ${page.content_family_coverage.compared_pairs} 组，比较上限 ${page.content_family_coverage.pair_limit} 组。${page.content_family_coverage.status === 'partial' ? '比较预算已用尽，仍有未比较内容。' : '已完成本次可用正文的计划比较。'}` : '本次没有可用的相似正文比较覆盖记录。'}</p>
    </section>
    {group && !reading && <ReadingDrawer title="文章版本与逐次来源观察" eyebrow="来源文章库" closeLabel="关闭来源观察" onClose={() => setSelected(null)}>
      <p className="source-article-title">{group.entries[0].title || '未取得来源标题'}</p><p className="citation-muted">当前显示 {group.entries.length} / {group.total} 条文章观察。每条正文与回答独立回查。</p>
      <div className="citation-stack">{group.entries.map(row => <Observation key={row.id} row={row} run={run} projectId={projectId} onEvidence={setReading} allRows={rows}
        onRelated={key => { setFilter({ query: '', status: 'all', platform: '' }); setSelected(key); }}
        onAnswer={() => { setSelected(null); onOpenAnswer(row.response_id, run.id); }}
        onSource={() => { setSelected(null); onOpenSource(row.snapshot_id!, row.title || '保存正文', run.id); }}
        onRetry={() => { setSelected(null); onRetry(row.document_id!); }} retrying={retrying} canWrite={page.can_write} />)}</div>
    </ReadingDrawer>}
    {reading && <EvidenceReading key={[reading.owner_id, reading.segment_id, reading.start].join(':')} context="source" reference={reading} projectId={projectId} onClose={() => setReading(null)} />}
  </div>;
}

function SourceStat({ title, value, detail }: { title: string; value: number | string; detail: string }) {
  return <div className="citation-panel citation-stat"><span className="citation-muted">{title}</span><strong>{value}</strong><small>{detail}</small></div>;
}
function ArticleRow({ article, run, onOpen }: { article: ArticleGroup; run: EvidenceRun; onOpen: () => void }) {
  const rows = article.entries, source = rows[0], saved = rows.filter(readableSnapshot);
  return <tr className="citation-source-entry"><td><strong>{source.title || '未取得来源标题'}</strong><small>{source.url || '未取得精确地址'}</small></td>
    <td>{[...new Set(rows.map(row => row.platform))].map(platform => <div className="source-platform-observation" key={platform}><AiPlatformLabel platform={platform} iconSize={15} /><small>{[...new Set(rows.filter(row => row.platform === platform).map(row => sourceKind(row.kind)))].join('、')}</small></div>)}</td>
    <td><span className="citation-tag">{saved.length} / {rows.length} 条正文可回查</span><small>{new Set(saved.map(row => row.snapshot_id)).size} 个绑定版本 · 完整性分别核对</small></td>
    <td><SourceBrands rows={rows} run={run} compact /></td>
    <td><button type="button" className="citation-link" onClick={onOpen}>展开 {rows.length} 条观察 →</button>{rows.length < article.total && <small>文章共 {article.total} 条，已按条件筛选</small>}</td></tr>;
}
function Observation({ row, run, projectId, onAnswer, onSource, onRetry, retrying, onEvidence, allRows, onRelated, canWrite }: {
  row: SourceObservation; run: EvidenceRun; projectId: string; onAnswer: () => void; onSource: () => void;
  onRetry: () => void; retrying: string | null; onEvidence: (ref: EvidenceReadTarget) => void;
  allRows: SourceObservation[]; onRelated: (key: string) => void; canWrite: boolean;
}) {
  const response = run.responses.find(value => value.id === row.response_id && value.platform === row.platform);
  const originalCard = run.sources.find(value => value.id === row.id && value.response_id === row.response_id && value.platform === row.platform);
  const anchor = row.answer_anchor, coverage = row.content_coverage, version = row.snapshot_version;
  const plans = (run.coverage.evidence_alignment?.observations || []).filter(value => value.citation_id === row.id);
  const evidence = (run.summary.claim_evidence || []).filter(value => value.citation_id === row.id && value.snapshot_id === row.snapshot_id && value.platform === row.platform && value.response_id === row.response_id);
  const familyPeers = row.content_family ? groupSources(allRows.filter(value => value.content_family?.id === row.content_family!.id &&
    (value.document_id ? value.document_id !== row.document_id : value.id !== row.id)), { query: '', status: 'all', platform: '' }) : [];
  return <article className="source-observation-card">
    <div className="source-observation-head"><AiPlatformLabel platform={row.platform} iconSize={19} /><span className={`citation-tag${row.actual_reference ? ' source-tag--reference' : ''}`}>{sourceKind(row.kind)}</span><small>{row.observed_at ? displayTime(row.observed_at) : '观察时间未记录'}</small></div>
    <h3>该次回答与引用关系</h3><p>{response?.prompt || '原问题未取得，请核对回答记录。'}</p>
    {row.kind !== 'answer_reference' && <p className="citation-inspect">{row.kind === 'search_candidate' ? '该文章出现在来源面板中，尚未确认回答实际引用。' : '该链接的实际引用关系未确认。'}不能计为实际引用，也不用于证明回答观点。</p>}
    {anchor?.status === 'valid' ? <div className="source-anchor"><small>采集锚点 · 字符 {anchor.start}–{anchor.end}（Unicode 码点，右端不含）</small><blockquote>{anchor.quote}</blockquote><p className="citation-muted">锚点用于定位引用关系，不证明模型采用了这段正文。打开保存回答后核对原文。</p></div>
      : <p className="citation-inspect">{anchor?.status === 'invalid' ? '采集锚点无效。' : '未采集到精确引用锚点。'}{row.actual_reference ? '观点与文章只可按同一回答推测关联，不能当作精确引用位置。' : '保留来源卡片，不能据此确定回答观点与文章的对应位置。'}</p>}
    <button type="button" className="citation-link" onClick={onAnswer} disabled={!response}>打开这条保存回答 →</button>
    <h3>该次观察绑定的正文</h3>
    <dl className="source-kv"><div><dt>版本状态</dt><dd>{readableSnapshot(row) ? '已保存绑定版本' : row.snapshot_id ? '绑定版本校验未通过，暂停正文回查' : row.fetch_status === 'blocked' ? '访问受限，未取得正文' : '未取得可回查正文'}</dd></div>
      <div><dt>保存文字</dt><dd>{coverage?.stored_text_integrity === 'verified' && row.frozen_version_valid ? `${coverage.saved_text_characters ?? '未知'} 字符 · 存储文字完整性已校验` : '保存文字完整性未知'}</dd></div>
      <div><dt>文本分析覆盖</dt><dd>{coverage?.stored_text_integrity === 'verified' && row.frozen_version_valid ? `${coverage.processed_characters ?? '未知'} / ${coverage.saved_text_characters ?? '未知'} 字符；不等于观点核验范围` : '无法确认，不能按已完成或零处理'}</dd></div>
      <div><dt>原文章完整性</dt><dd>{completeness(coverage?.article_completeness || version?.article_completeness)}</dd></div></dl>
    <div className="citation-inline-actions">{readableSnapshot(row) && <button type="button" className="citation-link" onClick={onSource}>打开该次正文版本 →</button>}
      {!row.snapshot_id && row.document_id && canWrite && <button type="button" className="citation-link" disabled={!!retrying} onClick={onRetry}>{retrying === row.document_id ? '正在提交补采…' : '补采这篇来源文章 →'}</button>}</div>
    {!row.snapshot_id && <p className="citation-muted">正文未取得，品牌提及和观点关系均保持未知。补采产生新分析修订，不改写本次冻结观察。</p>}
    <h3>该版本正文发现的主体</h3><SourceBrands rows={[row]} run={run} />
    <VerificationCoverage row={row} run={run} plans={plans} />
    {!!evidence.length && <section><h3>已生成的观点核验 · {evidence.length} 条</h3><p className="citation-muted">模型核验待复核，只对下列保存片段有效，不代表全文，也不证明模型实际使用了该段。</p>{evidence.map(value => <div className="source-verdict" key={value.id}>
      <div className="source-observation-head"><span className="citation-tag">{relationName(value.relation)}</span>{value.method === 'model_output_invalid' && <span className="citation-tag">核验输出无效</span>}{value.conflicting_interpretations && <span className="citation-tag">同家族解释有冲突</span>}</div>
      <small>回答观点</small><blockquote>{value.answer_quote}</blockquote><small>来源片段</small><blockquote>{value.source_quote || '未取得支持或反向证据，不能断言文章不存在相关信息。'}</blockquote>
      <p className="citation-muted">{value.verification?.association?.method === 'answer_anchor' ? '按采集锚点匹配' : '同一回答内推测关联，位置未确认'}</p>
      {run.claim_reviews?.[value.id] && <p className="source-human-review">人工复核：{relationName(run.claim_reviews[value.id].relation)} · {run.claim_reviews[value.id].reason}<br />复核引文：{run.claim_reviews[value.id].source_quote || '未登记来源引文'}（复核版本 {run.claim_reviews[value.id].version}）</p>}
      <div className="source-checks">{['subject', 'scope', 'time', 'number', 'condition'].map(dimension => {
        const check = value.verification?.result?.checks?.find(check => check.dimension === dimension);
        return <details key={dimension}><summary>{dimensionName(dimension)} · {relationName(check?.relation || 'unverified')}</summary><p>回答：{check?.answer_quote || '未取得该维度引文'}</p><p>来源：{check?.source_quote || '未取得该维度引文'}</p></details>;
      })}</div>
      {value.source_segment_id && value.verification?.source_span && readableSnapshot(row) && <button type="button" className="citation-link" onClick={() => onEvidence({ project_id: projectId, run_id: run.id, owner_kind: 'snapshot', owner_id: row.snapshot_id!, segment_id: value.source_segment_id!, ...value.verification!.source_span! })}>定位核验的来源原文 →</button>}
    </div>)}</section>}
    <h3>内容家族与溯源</h3><p>{row.content_family ? row.content_family.method === 'near_copy_candidate' ? `近似转载候选家族 · ${row.content_family.snapshot_ids.length} 个保存版本` : `相同正文家族 · ${row.content_family.snapshot_ids.length} 个保存版本` : '正文未能参与本次相似比较，内容家族未知。'}</p>
    {!!familyPeers.length && <details className="source-provenance"><summary>查看同家族的其他文章 · {familyPeers.length} 篇</summary>{familyPeers.map(article => <div key={article.key}><p>{article.entries[0].title || '未取得标题'}</p><button type="button" className="citation-link" onClick={() => onRelated(article.key)}>核对该文章的 {article.entries.length} 条观察 →</button></div>)}</details>}
    <p className="citation-muted">发布者独立性与原创归属未知。多平台出现不能直接归因为固定平台偏好。</p>
    <details className="source-provenance"><summary>查看原始来源卡片与版本标识</summary><dl className="source-kv"><div><dt>来源卡片</dt><dd>{row.title || '标题未取得'}<p>{row.url || '未取得精确地址'}</p><p>{originalCard?.snippet || '未取得来源摘要'}</p><small>来源卡片摘要不等于文章正文或观点支持证据。</small></dd></div>
      <div><dt>审计 / 修订</dt><dd>{run.audit_id} / {run.revision}</dd></div><div><dt>分析 Run</dt><dd>{run.id}</dd></div><div><dt>回答 / 观察</dt><dd>{row.response_id} / {row.id}</dd></div>
      <div><dt>正文版本</dt><dd>{row.snapshot_id || '未取得'}</dd></div><div><dt>内容指纹</dt><dd>{version?.body_hash || '未取得'}</dd></div><div><dt>提取版本</dt><dd>{version?.extractor_version || '未记录'}</dd></div></dl></details>
  </article>;
}

function SourceBrands({ rows, run, compact = false }: { rows: SourceObservation[]; run: EvidenceRun; compact?: boolean }) {
  const snapshotIds = new Set(rows.filter(readableSnapshot).map(row => row.snapshot_id));
  const mentions = (run.summary.mentions || []).filter(value => value.owner_kind === 'snapshot' && snapshotIds.has(value.owner_id));
  const names = [...new Map(mentions.map(value => [value.entity_id || value.entity_name, value])).values()];
  if (!names.length) return <small className="citation-muted">{compact ? '主体提及待核对' : '暂无可回查的主体提及；不代表文章没有品牌。'}</small>;
  return <div className="source-brand-list">{names.map((value, index) => {
    const entity = run.summary.entities?.find(entity => entity.id === value.entity_id);
    const role = !entity || value.identity_ambiguity || entity.identity_status !== 'confirmed' ? '身份待确认' : entity.role === 'own' ? '自有品牌' : entity.role === 'competitor' ? '已登记竞品' : entity.role === 'comparison' ? '比较主体' : '未登记主体';
    return <span key={index} className="citation-tag">{value.entity_name} · {role}</span>;
  })}{!compact && <p className="citation-muted">仅为保存正文中的提及，不能计作平台回答推荐或品牌回答提及。</p>}</div>;
}

function VerificationCoverage({ row, run, plans }: { row: SourceObservation; run: EvidenceRun; plans: NonNullable<EvidenceRun['coverage']['evidence_alignment']>['observations'] }) {
  return <section><h3>观点核验覆盖</h3>{!plans.length ? <p className="citation-muted">{row.actual_reference ? '没有可回查的观点核验覆盖记录，不能当作已核验或文章不支持。' : '候选与其他链接不进入实际引用的观点核验队列。'}</p>
    : plans.map((plan, index) => <details className="source-coverage" key={`${plan.claim_hash}:${index}`}><summary>{plan.answer_span.quote} · 已核验 {plan.selected.filter(value => value.status === 'checked').length} / {plan.available_segments} 个候选片段</summary>
      <p className="citation-muted">{plan.association.method === 'answer_anchor' ? '按采集锚点定位关联。' : plan.association.method === 'same_answer_fallback' ? '按同一回答推测关联，未确认精确引用位置。' : '引用位置与该观点未能建立有效关联。'}</p>
      {plan.unavailable_reason && <p>正文或对应片段不可核验，保持未知。</p>}
      {plan.selected.map((value, selectedIndex) => <p key={selectedIndex}>字符 {value.start}–{value.end}：{({ checked: '已核验，结论待复核', deferred: '预算或处理条件限制，未核验', invalid: '核验输出无效，未形成有效结论' } as Record<string, string>)[value.status] || '未核验'}</p>)}
      {plan.unchecked_ranges.length > 0 && <p className="source-unchecked">未核验范围：{plan.unchecked_ranges.map(([start, end]) => `${start}–${end}`).join('、')} 字符（Unicode 码点）</p>}
      <p className="citation-muted">{plan.unchecked_ranges.length ? '未核验范围不能当作缺少支持或没有品牌。' : '仅完成当前候选保存片段的计划核验，不能据此认定原文章全文已核验。'} 本次修订 {run.revision}。</p>
    </details>)}</section>;
}
function displayTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '观察时间格式未确认' : date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); }
function relationName(value: string) { return ({ supports: '支持', partial: '部分支持', contradicts: '存在冲突', unverified: '无法核验' } as Record<string, string>)[value] || '未知'; }
function dimensionName(value: string) { return ({ subject: '主体', scope: '范围', time: '时间', number: '数字', condition: '限定条件' } as Record<string, string>)[value]; }
