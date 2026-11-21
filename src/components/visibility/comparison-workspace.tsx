'use client';

import { useState } from 'react';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { ReadingDrawer } from '@/components/ui/reading-drawer';
import type { EvidenceRun } from '@/types/intelligence';
import type { CitationProof, ComparisonQuestion, ComparisonReport, ComparisonSample, ComparisonSource, ComparisonTarget, RecommendationFinding } from '@/lib/visibility/comparison-workspace';
import { SCENARIOS } from '@/lib/visibility/scenarios';
import { dimensions, safeHttp, scenarioName, setTaskScope, type TaskScope } from '@/lib/visibility/task-view';
import type { VisibilityScore } from '@/lib/visibility/v4-audit';
import { OpportunityOverview } from './opportunity-overview';
import { useAuditResource } from './use-audit-v4';
import './comparison-workspace.css';

const roles: Record<string, string> = { own: '自有品牌', competitor: '登记竞品', comparison: '仅用于比较', unregistered: '未登记品牌' };
const kinds: Record<string, string> = { feature: '功能', parameter: '规格参数', price: '价格与成本', audience: '客群适配', use_case: '场景适配',
  implementation: '实施与集成', case_study: '案例与验证', test_method: '验证方法', risk: '风险限制', faq: '常见问题', comparison: '比较条件', selection_reason: '选择理由' };
const statuses: Record<string, string> = { received: '已取得回答', partial: '部分回答', failed: '采集失败', cancelled: '已取消', missing: '未取得回答', pending: '待采集', leased: '采集中', sealed: '回答不可用' };
const sourceTypes: Record<string, string> = { case_study: '客户案例', review: '媒体评测', documentation: '帮助文档', discussion: '社区讨论', unknown: '类型待核实' };
const relationships: Record<string, string> = { supports: '支持', partial: '部分支持', contradicts: '冲突', unverified: '待核实' };
const recommendations: Record<string, string> = { priority: '优先推荐', recommended: '明确推荐', tied: '并列推荐', alternative: '条件备选', mentioned: '仅提及', not_recommended: '明确不推荐', unknown: '推荐状态待核实' };
const canCompare = (target: ComparisonTarget) => target.identity_method !== 'unresolved';
const display = (value?: number | null) => value == null ? '—' : value.toLocaleString('zh-CN');
const tag = (label: string, tone = '') => <span className={`comparison-tag ${tone}`}>{label}</span>;

type OpenContent = (kind: 'answer' | 'snapshot', id: string, title: string) => void;
type WorkspaceProps = {
  mode: 'brands' | 'platforms'; run: EvidenceRun; projectId: string; scope: TaskScope; search: string; version: number;
  onOpenContent: OpenContent; onIdentity: (entityId?: string) => void; onPreferences: () => void; onQuestionReview: () => void;
};

export function ComparisonWorkspace(props: WorkspaceProps) {
  const { mode, run, projectId, scope, search, version } = props;
  const params = new URLSearchParams({ view: 'comparison', mode, projectId, runId: run.id });
  const question = new URLSearchParams(search).get('project') === projectId ? new URLSearchParams(search).get('question') : null;
  if (mode === 'brands') {
    if (scope.own) params.set('ownTarget', scope.own);
    if (scope.comparison) params.set('compareTarget', scope.comparison);
    if (scope.platform) params.set('platform', scope.platform);
  } else if (question) params.set('question', question);
  if (scope.scenario !== 'all') params.set('scenario', scope.scenario);
  const resource = useAuditResource<ComparisonReport>('/api/integration/intelligence?' + params, version, true);
  const report = resource.data?.run_id === run.id && resource.data.audit_id === run.audit_id &&
    resource.data.revision === run.revision ? resource.data : null;
  if (resource.error || resource.data && !report) return <p role="alert" className="citation-notice citation-notice--warning">
    {resource.error || '返回的数据与当前审计版本不一致。'} <button type="button" className="citation-link" onClick={resource.refetch}>重新读取</button>
  </p>;
  if (!report) return <p role="status" className="citation-notice">正在读取当前范围的对照结果…</p>;
  const values = { ...scope, own: scope.own || report.brands?.own_target_id || '',
    comparison: scope.comparison || report.brands?.comparison_target_id || '' };
  if (!values.own) {
    const own = report.targets.filter(target => target.role === 'own');
    if (own.length === 1) values.own = own[0].target_id;
  }
  return mode === 'brands'
    ? <BrandComparison {...props} report={report} values={values} loading={resource.loading} />
    : <PlatformComparison {...props} report={report} values={values} loading={resource.loading} requestedQuestion={question} />;
}

type RenderProps = WorkspaceProps & { report: ComparisonReport; values: TaskScope; loading: boolean };

function Filters({ report, values, projectId, mode }: RenderProps) {
  const change = (key: keyof TaskScope, value: string) => setTaskScope(projectId, { [key]: value });
  const own = report.targets.filter(row => row.role === 'own');
  const other = report.targets.filter(row => row.role !== 'own');
  const platforms = Array.from(new Set(report.questions.flatMap(question => question.platforms)));
  return <div className="comparison-filters">
    {(mode === 'brands' || own.length > 1) && <label>自有品牌<select value={values.own} onChange={event => change('own', event.target.value)}>
      <option value="">选择自有品牌</option>{own.map(row => <option key={row.target_id} value={row.target_id}>{row.name}</option>)}
      {values.own && !own.some(row => row.target_id === values.own) && <option value={values.own}>原品牌需要重新选择</option>}
    </select></label>}
    <label>对比品牌<select value={values.comparison} onChange={event => change('comparison', event.target.value)}>
      <option value="">{mode === 'brands' ? '自动选择可比品牌' : '全部品牌'}</option>{other.map(row => <option key={row.target_id} value={row.target_id}>
        {row.name}{canCompare(row) ? row.role === 'unregistered' ? ' · 未登记' : '' : ' · 待核实'}
      </option>)}
      {values.comparison && !other.some(row => row.target_id === values.comparison) && <option value={values.comparison}>原对比品牌需要重新选择</option>}
    </select></label>
    <label>{mode === 'brands' ? '目标平台' : '重点平台'}<select value={values.platform} onChange={event => change('platform', event.target.value)}>
      <option value="">全部平台</option>{platforms.map(platform => <option key={platform} value={platform}>{getAiPlatformLabel(platform)}</option>)}
      {values.platform && !platforms.includes(values.platform) && <option value={values.platform}>原平台需要重新选择</option>}
    </select></label>
    {mode === 'brands' && <label>需求场景<select value={values.scenario} onChange={event => change('scenario', event.target.value)}>
      <option value="all">全部场景</option>{Object.entries(SCENARIOS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      <option value="unreviewed">场景待审核</option>
    </select></label>}
  </div>;
}

function Radar({ own, other }: { own: VisibilityScore | null; other: VisibilityScore | null }) {
  const axis = (value: number, index: number) => [155 + Math.sin(index * Math.PI / 2) * value, 127 - Math.cos(index * Math.PI / 2) * value];
  const points = (values: number[]) => values.map((value, index) => axis(value, index).join(',')).join(' ');
  const scores = [own, other].map(score => Object.keys(dimensions).map(key => score?.dimensions?.find(row => row.dimension === key)?.value ?? null));
  if (!scores.some(values => values.some(value => value !== null))) return null;
  return <div className="comparison-radar">
    <svg viewBox="0 0 310 255" role="img" aria-label="共同样本四维评分雷达图">
      {[25, 50, 75, 100].map(value => <polygon className="comparison-radar-grid" key={value} points={points([value, value, value, value])} />)}
      {Object.keys(dimensions).map((key, index) => { const [x, y] = axis(100, index); return <line className="comparison-radar-grid" key={key} x1={155} y1={127} x2={x} y2={y} />; })}
      <text x="155" y="17" textAnchor="middle">品牌出现</text><text x="308" y="131" textAnchor="end">推荐强度</text>
      <text x="155" y="246" textAnchor="middle">推荐位置</text><text x="2" y="131">选择理由</text>
      {scores.map((values, index) => values.every((value): value is number => value !== null) &&
        <g key={index} className={index ? 'comparison-radar-other' : 'comparison-radar-own'}><polygon points={points(values)} />
          {values.map((value, i) => { const [cx, cy] = axis(value, i); return <circle key={i} cx={cx} cy={cy} r="3" />; })}</g>)}
    </svg>
    <dl>{Object.values(dimensions).map((name, index) => <div key={name}><dt>{name}</dt><dd>{display(scores[0][index])} / {display(scores[1][index])}</dd></div>)}</dl>
  </div>;
}

function BrandComparison(props: RenderProps) {
  const { report, values, projectId, run, onIdentity, onQuestionReview, loading } = props;
  const [axis, setAxis] = useState<'platform' | 'scenario'>('scenario');
  const [showRules, setShowRules] = useState(false);
  if (!report.brands) return null;
  const { own, pair, coverage, brands, gaps, matrices, observations_available: available } = report.brands;
  const names = new Map(report.targets.map(row => [row.target_id, row.name]));
  const left = names.get(values.own) || '自有品牌', right = names.get(values.comparison) || '对比品牌';
  const questions = new Map(report.questions.map(row => [row.id, row]));
  const openQuestion = (id: string, platform: string) => setTaskScope(projectId, {
    own: values.own, comparison: values.comparison, platform, action: '', opportunity: '',
  }, { view: 'platforms', question: id, auditId: run.audit_id, runId: run.id, fromBrandPlatform: values.platform });
  const gap = pair.own?.value != null && pair.other?.value != null ? pair.other.value - pair.own.value : null;
  const focus = gaps[0];
  return <div className="comparison-workspace">
    <section className="citation-panel citation-pad"><Filters {...props} /></section>
    {loading ? <p role="status" className="citation-notice">正在读取当前范围的品牌表现…</p> : <>
    <section className="citation-panel citation-pad">
      <div className="comparison-heading"><h2>品牌表现</h2><button type="button" className="citation-link" onClick={() => setShowRules(true)}>评分依据</button></div>
      <div className="comparison-score-layout"><div>
        <div className="comparison-scorecards">
          <div><span>{left} · 自有品牌</span><strong>{display(pair.count ? pair.own?.value : own?.value)}</strong></div>
          <div><span>{right} · 对比品牌</span><strong>{display(pair.other?.value)}</strong></div>
        </div>
        <p className="comparison-gap">{gap === null ? '暂无可比样本' : gap === 0 ? '双方在共同样本中同分' : `${gap > 0 ? right : left}领先 ${Math.abs(gap)} 分`}</p>
        <p className="citation-muted">计划 {coverage.planned} · 已取得 {coverage.received} · 我方可评分 {own?.coverage?.scored || 0} · 共同可评分 {pair.count}</p>
        {focus && <div className="comparison-focus"><b>值得查看的问题</b><p>{questions.get(focus.question_id)?.prompt}</p>
          <button type="button" className="citation-link" onClick={() => openQuestion(focus.question_id, focus.platform)}>查看同题推荐依据 ↗</button></div>}
      </div><Radar own={pair.own} other={pair.other} /></div>
    </section>
    <section className="citation-panel citation-pad">
      <div className="comparison-heading"><div><h2>品牌名单</h2><p className="citation-muted">{available ? `当前范围已取得 ${coverage.received} 份回答，以下为已核对的正文观察` : '当前分析尚未产生可用的品牌观察。'}</p></div>
        <button type="button" className="citation-link" onClick={() => onIdentity()}>品牌身份管理</button></div>
      {brands.length ? <div className="comparison-table"><table className="citation-table">
        <thead><tr><th>品牌与身份</th><th>正文提及</th><th>明确推荐</th><th>出现平台</th><th>单品牌评分</th><th>操作</th></tr></thead>
        <tbody>{brands.map(row => <tr key={row.target_id} className={row.target_id === values.comparison ? 'comparison-selected' : undefined}>
          <td><strong>{row.name}</strong><small>{roles[row.role] || row.role}{canCompare(row) ? '' : ' · 身份或对比范围待核实'}</small></td>
          <td>{available && coverage.received ? `${row.answer_count} / ${coverage.received}` : '—'}</td><td>{available && coverage.received ? row.recommended_count : '—'}</td>
          <td><div className="comparison-icons">{row.platforms.map(platform => <AiPlatformLabel platform={platform} key={platform} iconSize={15} />)}</div></td>
          <td>{display(row.score?.value)}{row.score?.coverage && <small>{row.score.coverage.scored} / {row.score.coverage.planned} 个可评分样本</small>}</td>
          <td><div className="comparison-icons">
            {row.role !== 'own' && canCompare(row) && row.target_id !== values.comparison &&
              <button type="button" className="citation-link" onClick={() => setTaskScope(projectId, { comparison: row.target_id })}>用于对比</button>}
            {row.entity_id && <button type="button" className="citation-link" onClick={() => onIdentity(row.entity_id!)}>{canCompare(row) ? '查看身份与证据' : '确认身份'}</button>}
          </div></td>
        </tr>)}</tbody></table></div> : <p className="citation-empty">当前分析版本暂无可用品牌观察。</p>}
    </section>
    <section className="citation-panel citation-pad">
      <div className="comparison-heading"><div><h2>差距分布</h2><p className="citation-muted">以同一范围内双方共同可评分的回答为准</p></div>
        <div className="comparison-segment" aria-label="差距查看方式">
          <button type="button" aria-pressed={axis === 'scenario'} onClick={() => setAxis('scenario')}>按场景</button>
          <button type="button" aria-pressed={axis === 'platform'} onClick={() => setAxis('platform')}>按平台</button>
        </div></div>
      {matrices[axis].length ? <div className="comparison-table"><table className="citation-table">
        <thead><tr><th>{axis === 'platform' ? '平台' : '场景'}</th><th>{left}</th><th>{right}</th><th>对比品牌分差</th><th>共同样本</th><th>代表问题</th></tr></thead>
        <tbody>{matrices[axis].map(row => {
          const best = gaps.find(item => axis === 'platform' ? item.platform === row.key : (questions.get(item.question_id)?.scenario ?? null) === row.key);
          const difference = row.own != null && row.other != null ? row.other - row.own : null;
          return <tr key={row.key || 'unreviewed'}><td>{axis === 'platform' && row.key ? <AiPlatformLabel platform={row.key} iconSize={16} /> : scenarioName(row.key || '')}</td>
            <td>{display(row.own)}</td><td>{display(row.other)}</td><td>{difference && difference > 0 ? '+' : ''}{display(difference)}</td><td>{row.common} / {row.planned}</td>
            <td>{best ? <button type="button" className="citation-link" onClick={() => openQuestion(best.question_id, best.platform)}>{questions.get(best.question_id)?.prompt} ↗</button> : '—'}</td></tr>;
        })}</tbody></table></div> : <p className="citation-empty">当前范围暂无可评分数据。</p>}
    </section>
    {showRules && <ReadingDrawer title="品牌评分依据" closeLabel="关闭评分依据" onClose={() => setShowRules(false)}>
      <p>品牌出现 25%、推荐强度 40%、推荐位置 15%、选择理由 20%。先按平台汇总有效样本，再对有分平台等权。品牌分差使用双方共同可评分的样本。</p>
      <p>本范围计划 {coverage.planned} 份，取得 {coverage.received} 份。我方有效计分 {own?.coverage?.scored || 0} 份，双方共同计分 {pair.count} 份。</p>
      <button type="button" className="citation-link" onClick={() => { setShowRules(false); onQuestionReview(); }}>审核问题范围 ↗</button>
    </ReadingDrawer>}
    </>}
  </div>;
}

function SourceEvidence({ source, proofs, onOpen }: { source: ComparisonSource; proofs: CitationProof[]; onOpen: OpenContent }) {
  return <div className="comparison-source"><h3>{source.title || '未取得来源标题'}</h3><small>{source.domain || '发布方未知'} · {sourceTypes[source.content_type] || '类型待核实'}{source.ordinal ? ` · 引用 ${source.ordinal}` : ''}</small>
    {source.anchor && <p className="citation-muted">已保存回答引用锚点</p>}
    {proofs.length ? proofs.map(proof => <div key={proof.id} className="comparison-proof">{tag((relationships[proof.relation] || '待核实') + (proof.reviewed ? ' · 已复核' : ' · 待复核'))}
      <blockquote>{proof.answer_quote}</blockquote><blockquote>{proof.quote}</blockquote></div>)
      : <p>{source.frozen ? '已保存正文，当前关联待核实。' : '仅有引用记录，冻结正文尚不可核对。'}</p>}
    {source.frozen && source.snapshot_id && <button type="button" className="citation-link" onClick={() => onOpen('snapshot', source.snapshot_id!, '引用文章原文')}>查看保存的正文 ↗</button>}
    {safeHttp(source.url) && <a className="citation-link" href={source.url!} target="_blank" rel="noopener noreferrer">打开原始链接 ↗</a>}
  </div>;
}

function PlatformComparison(props: RenderProps & { requestedQuestion: string | null }) {
  const { report, values, requestedQuestion, projectId, run, search, onOpenContent, onPreferences, loading } = props;
  const [selectedSource, setSource] = useState<{ source: ComparisonSource; proofs: CitationProof[]; title: string; platform: string; questionId: string } | null>(null);
  const detail = loading ? null : report.detail;
  const question = detail?.question;
  const samples = detail?.samples || [];
  const sources = samples.flatMap(sample => sample.sources.map(source => ({ sample, source })));
  const withReference = new Set(sources.map(row => row.sample.response_id)).size;
  const support = new Set(sources.filter(row => row.source.evidence.some(proof => proof.relation === 'supports')).map(row => row.sample.response_id)).size;
  const saved = new Set(sources.filter(row => row.source.frozen && row.source.snapshot_id).map(row => row.source.family_id || row.source.snapshot_id)).size;
  const sourceGroups = new Map<string, { answers: Set<string | null>; supporting: Set<string | null>; families: Set<string> }>();
  for (const { source, sample } of sources) {
    const key = `${source.domain || '发布方未知'} · ${sourceTypes[source.content_type] || '类型待核实'}`;
    if (!sourceGroups.has(key)) sourceGroups.set(key, { answers: new Set(), supporting: new Set(), families: new Set() });
    const group = sourceGroups.get(key)!;
    group.answers.add(sample.response_id);
    if (source.evidence.some(proof => proof.relation === 'supports')) group.supporting.add(sample.response_id);
    if (source.frozen && source.snapshot_id) group.families.add(source.family_id || source.snapshot_id);
  }
  const criteria = new Map<string, Set<string>>();
  for (const sample of samples) for (const finding of sample.findings) for (const reason of finding.reasons) {
    for (const kind of reason.categories) {
      if (!criteria.has(kind)) criteria.set(kind, new Set());
      criteria.get(kind)?.add(sample.platform);
    }
  }
  const back = () => {
    const origin = new URLSearchParams(search).get('fromBrandPlatform');
    setTaskScope(projectId, { platform: origin ?? values.platform }, { view: 'entities' });
  };
  const viewBrand = (finding: RecommendationFinding) => {
    if (finding.target_id === values.own) return back();
    const origin = new URLSearchParams(search).get('fromBrandPlatform');
    setTaskScope(projectId, { own: values.own, comparison: finding.target_id || '', platform: origin ?? values.platform }, { view: 'entities' });
  };
  const read = (sample: ComparisonSample, source: ComparisonSource, proofs = source.evidence) =>
    question && setSource({ source, proofs, title: source.title || '引用证据', platform: sample.platform, questionId: question.id });
  return <div className="comparison-workspace">
    <section className="citation-panel citation-pad">
      <div className="comparison-heading"><div><h2>问题与样本</h2>{question && <p className="citation-muted">{scenarioName(question.scenario || '')} · 已取得 {samples.filter(row => row.response_id).length} / {samples.length} 份回答</p>}</div>
        <button type="button" className="citation-link" onClick={back}>返回品牌发现对比 ↗</button></div>
      <label className="comparison-question">对照提示词<select value={question?.id || requestedQuestion || ''} onChange={event =>
        setTaskScope(projectId, { opportunity: '', action: '' }, { question: event.target.value })}>
        <option value="">选择问题</option>
        {requestedQuestion && !report.questions.some(item => item.id === requestedQuestion) && <option value={requestedQuestion}>原问题不在当前版本</option>}
        {report.questions.map(item => <option value={item.id} key={item.id}>{item.prompt}</option>)}
      </select></label>
      <Filters {...props} />
      {!!samples.length && <ul className="comparison-samples" aria-label="各平台采集情况">{samples.map((sample, i) => <li key={sample.sample_id || i}>
        <AiPlatformLabel platform={sample.platform} iconSize={17} />{tag(statuses[sample.status] || '未取得回答', sample.status === 'received' ? 'is-good' : 'is-warning')}
      </li>)}</ul>}
      {loading ? <p role="status" className="citation-muted">正在读取这道题的推荐和引用…</p> : !question && <p className="citation-empty">{requestedQuestion ? '请重新选择这个分析版本中的问题。' : '当前范围没有可对照的问题。'}</p>}
    </section>
    {question && <>
      <section className="citation-panel citation-pad">
        <div className="comparison-heading"><div><h2>推荐结果与选择依据</h2><p className="citation-muted">各平台在这道题中明确写出的选择条件</p></div></div>
        {!!criteria.size && <div className="comparison-condition">{[...criteria].map(([kind, platforms]) => <div key={kind}><strong>{kinds[kind] || kind}</strong>
          {[...platforms].map(platform => <AiPlatformLabel key={platform} platform={platform} iconSize={14} />)}</div>)}</div>}
        <div className="comparison-platform-grid">{samples.map((sample, index) => <article key={sample.sample_id || index} className={`comparison-card ${sample.platform === values.platform ? 'comparison-focused' : ''}`}>
          <div className="comparison-heading"><AiPlatformLabel platform={sample.platform} iconSize={20} />{tag(statuses[sample.status] || '未取得回答')}</div>
          {sample.search_mode && <p className="citation-muted">{sample.search_mode === 'enabled' ? '搜索开启' : sample.search_mode === 'disabled' ? '搜索关闭' : '搜索状态待核对'}</p>}
          {!sample.findings.length && <p className="citation-muted">{sample.response_id ? sample.analysis_ready ? '暂无可核对的品牌推荐结论。' : '回答已取得，推荐分析尚不可用。' : '本平台没有可用回答。'}</p>}
          {sample.findings.map(finding => <div key={finding.entity_id} className={`comparison-finding ${[values.own, values.comparison].includes(finding.target_id || '') ? 'comparison-selected' : ''}`}>
            <div className="comparison-icons"><button type="button" className="citation-link" onClick={() => viewBrand(finding)}>{finding.name}</button>
              {tag(recommendations[finding.recommendation] || '待核实')}{finding.rank != null && tag(`推荐位置 ${finding.rank}`)}</div>
            {finding.reasons.length ? finding.reasons.map(reason => <div key={reason.id} className="comparison-reason">
              {!!reason.categories.length && <small>{reason.categories.map(kind => kinds[kind] || kind).join(' · ')}</small>}
              <p>{reason.quote}</p>
              {[...new Set(reason.evidence.map(proof => proof.source_id))].map(id => {
                const source = sample.sources.find(item => item.id === id);
                return source ? <button key={id} type="button" className="citation-link" onClick={() => read(sample, source, reason.evidence.filter(proof => proof.source_id === id))}>查看引用依据 ↗</button> : null;
              })}
            </div>) : <p>{finding.quote}</p>}
          </div>)}
          {sample.response_id && values.own && !sample.findings.some(finding => finding.target_id === values.own) &&
            <p className="citation-muted">{sample.absent_targets?.includes(values.own) ? '完整分析确认未提及自有品牌。' : '自有品牌在这份回答中的状态待核实。'}</p>}
          {sample.response_id && <button type="button" className="citation-link" onClick={() => onOpenContent('answer', sample.response_id!, '同题原始回答')}>查看原始回答 ↗</button>}
        </article>)}</div>
      </section>
      <section className="citation-panel citation-pad">
        <div className="comparison-heading"><div><h2>引用来源与支撑</h2>
          <p className="citation-muted">观察到引用 {withReference} / {samples.filter(row => row.response_id).length} 份回答 · 有正文支持 {support} 份 · 去重后已存 {saved} 份正文</p></div></div>
        {!!sourceGroups.size && <details className="citation-deep-details">
          <summary>按来源与内容类型汇总</summary><div className="comparison-table"><table className="citation-table">
            <thead><tr><th>来源与类型</th><th>引用回答</th><th>正文有支持</th><th>去重正文</th></tr></thead>
            <tbody>{[...sourceGroups].map(([key, value]) => <tr key={key}><td>{key}</td><td>{value.answers.size}</td><td>{value.supporting.size}</td><td>{value.families.size}</td></tr>)}</tbody>
          </table></div></details>}
        {sources.length ? <div className="comparison-table"><table className="citation-table"><thead><tr><th>平台</th><th>来源与域名</th><th>支撑状态</th><th>原文</th></tr></thead>
          <tbody>{sources.map(({ sample, source }) => <tr key={source.id}><td><AiPlatformLabel platform={sample.platform} iconSize={17} /></td>
            <td><b>{source.title || '未取得来源标题'}</b><small>{source.domain || '发布方未知'} · {sourceTypes[source.content_type] || '类型待核实'}</small></td>
            <td>{source.evidence.length ? [...new Set(source.evidence.map(proof => relationships[proof.relation] || '待核实'))].join(' / ')
              : source.frozen ? '正文已存 · 关联待核实' : '正文尚未取得'}</td>
            <td><button type="button" className="citation-link" onClick={() => read(sample, source)}>核对引用 ↗</button></td></tr>)}</tbody></table></div>
          : <p className="citation-empty">该题暂无可核对的实际引用。</p>}
      </section>
      <OpportunityOverview run={run} projectId={projectId} scope={values} search={search} onPreferences={onPreferences}
        selectedQuestion={question} responseIds={samples.flatMap(row => row.response_id ? [row.response_id] : [])}
        supportedSnapshots={sources.flatMap(row => row.source.snapshot_id && row.source.evidence.some(proof => proof.relation === 'supports') ? [row.source.snapshot_id] : [])} />
    </>}
    {selectedSource && question?.id === selectedSource.questionId && <ReadingDrawer title={selectedSource.title} closeLabel="关闭引用依据" onClose={() => setSource(null)}>
      <div className="comparison-icons"><AiPlatformLabel platform={selectedSource.platform} /> <span>{question?.prompt}</span></div>
      <SourceEvidence source={selectedSource.source} proofs={selectedSource.proofs} onOpen={(kind, id, title) => {
        setSource(null); onOpenContent(kind, id, title);
      }} />
    </ReadingDrawer>}
  </div>;
}
