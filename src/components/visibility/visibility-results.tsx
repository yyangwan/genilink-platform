"use client";

import { useState } from 'react';
import Link from 'next/link';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { SavedContent } from './saved-content';
import type { CitationDashboard } from '@/types/citation-dashboard';
import type { CitationReport } from '@/types/citation-report';
import { getAiPlatformLabel } from '@/lib/ai-platforms';

type View = 'overview' | 'platforms' | 'sources' | 'actions';
const views: Array<{ id: View; label: string }> = [
  { id: 'overview', label: '结果总览' }, { id: 'platforms', label: '分平台比较' },
  { id: 'sources', label: '来源与证据' }, { id: 'actions', label: '优化行动' },
];
const sourceKinds: Record<string, string> = {
  answer_reference: '回答实际引用', search_candidate: '检索候选', text_link: '文本链接', named_inference: '推测来源',
};
const sourceStates: Record<string, string> = { captured: '正文已保存', pending: '待抓取', blocked: '访问受限', unavailable: '无法取得' };

function ownRatio(report: CitationReport, platform: string, metric: string) {
  const own = report.entities?.find(entity => entity.role === 'own' && entity.identity_status === 'confirmed');
  const row = report.platforms?.find(item => item.platform === platform)?.metrics.find(item => item.metric === metric);
  const value = own && row?.entities.find(item => item.entity_id === own.id);
  return value?.denominator ? `${value.numerator} / ${value.denominator}` : '暂无有效分母';
}

export function VisibilityResults({ data, projectId, auditId }: { data: CitationDashboard; projectId: string; auditId: string }) {
  const [view, setView] = useState<View>('overview');
  const [platform, setPlatform] = useState('');
  const [owner, setOwner] = useState<{ kind: string; id: string } | null>(null);
  const report = data.report?.audit_id === auditId ? data.report : null;
  const ready = !!report?.run_id && ['ready', 'partial', 'stale'].includes(report.status);
  const full = ready && report.entitlementLevel !== 'basic';
  const platforms = Array.from(new Set([...(data.latest_audit?.id === auditId ? data.latest_audit.platforms : []), ...(report?.platforms || []).map(item => item.platform)]));
  const visiblePlatforms = (report?.platforms || []).filter(item => !platform || item.platform === platform);
  const sources = (report?.sources || []).filter(item => !platform || item.platform === platform);
  const diagnoses = (report?.diagnoses || []).filter(item => !platform || item.platform === platform);
  const query = new URLSearchParams({ project: projectId, auditId });
  const intelligence = (tab: string) => `/intelligence?${new URLSearchParams({ ...Object.fromEntries(query), view: tab, ...(report?.run_id ? { runId: report.run_id } : {}) })}`;
  const sourceGap = report?.coverage && Math.max(0, (report.coverage.sources || 0) - (report.coverage.captured_sources || 0));
  const visibleSourceGap = platform ? sources.filter(item => item.fetch_status !== 'captured').length : sourceGap;
  const disabled = !ready;
  return <section className="visibility-results" aria-label="本次审计结果">
    <div className="visibility-results__tabs" role="tablist" aria-label="本次审计结果">{views.map((item, index) => <button key={item.id} id={`visibility-result-${item.id}`} type="button" role="tab" aria-controls="visibility-result-panel" aria-selected={view === item.id} disabled={disabled && item.id !== 'overview'} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      const target = views[(next + views.length) % views.length];
      if (!disabled || target.id === 'overview') { setView(target.id); document.getElementById(`visibility-result-${target.id}`)?.focus(); }
    }}>{item.label}{ready && item.id === 'sources' && report?.coverage?.sources != null ? <small>{report.coverage.sources}</small> : null}{ready && item.id === 'actions' && report?.diagnoses?.length ? <small>{report.diagnoses.length}</small> : null}</button>)}</div>
    <div className="visibility-results__filters">{ready ? <label>分析平台 <select aria-label="筛选分析平台" value={platform} onChange={event => setPlatform(event.target.value)}><option value="">全部平台</option>{platforms.map(item => <option value={item} key={item}>{getAiPlatformLabel(item)}</option>)}</select></label> : <span>结果需等待当前审计的分析修订</span>}<span>{auditId ? `审计 #${auditId}` : '尚无审计'}{report?.revision != null ? ` · 修订 ${report.revision}` : ' · 等待分析修订'}</span></div>
    <div id="visibility-result-panel" role="tabpanel" aria-labelledby={`visibility-result-${view}`} tabIndex={0} className="visibility-results__panel">
      {!ready ? <div className="visibility-results__empty"><h2>{report?.status === 'failed' ? '本次分析未成功' : report && !report.snapshot_current ? '本次分析快照尚未就绪' : auditId ? '正在为本次审计收集回答与来源' : '从采集设置创建一次审计'}</h2><p>{auditId ? '当前仅显示该审计的真实进度。结果会在分析修订就绪后展示，不使用历史审计填充。' : '创建任务后会在这里显示分平台进度与本次分析结果。'}</p>{report?.coverage && <p>已取得回答 {report.coverage.responses ?? '未知'}；已保存来源正文 {report.coverage.captured_sources ?? '未知'} / {report.coverage.sources ?? '未知'}；已分析字符 {report.coverage.analyzed_characters ?? '未知'} / {report.coverage.total_characters ?? '未知'}。</p>}{!!platforms.length && <div className="visibility-results__platform-list">{platforms.map(item => <span key={item}><AiPlatformLabel platform={item} iconSize={16} /></span>)}</div>}<p>回答采集与来源归档可并行；回答完成不代表分析结果完成。</p></div> : !full ? <div className="visibility-results__empty"><h2>本次基础分析已就绪</h2><p>完整的实体、来源证据与行动清单需要完整分析权限。已取得回答与来源概况可在上方查看。</p></div> : <>
        {!report.snapshot_current && <p className="visibility-results__notice" role="status">这份修订的快照已过期，只供回查；请更新分析后再据此安排优化行动。</p>}
        {report.status === 'partial' && <p className="visibility-results__notice" role="status">本次为部分完成的分析修订。{report.coverage?.analyzed_characters === 0 && (report.coverage.total_characters || 0) > 0 ? `已分析字符 0 / ${report.coverage.total_characters}，当前不能据此判断品牌表现。` : ''}未取得的回答、正文和未分析片段不计为品牌缺席。</p>}
        {view === 'overview' && <div className="visibility-results__stack">
          <article className="visibility-results__surface"><span className="audit-eyebrow">本次分析观察 · 待人工复核</span><h2>{diagnoses[0]?.finding || (report.coverage?.analyzed_characters === 0 ? '本次暂无可用的文本分析结论，请先核对解析失败原因' : platform ? '当前平台暂无可展示的诊断，请核对该平台的分析覆盖' : '本次审计已形成分析修订，等待可展示的分平台诊断')}</h2><p>结论仅基于已分析样本。不同平台的差异为本次描述性观察，效果变化请通过固定样本复测核验。</p><div className="visibility-results__metrics"><div><span>全平台已取得回答</span><strong>{report.coverage?.responses ?? '未知'}</strong></div><div><span>全平台已存来源正文</span><strong>{report.coverage ? `${report.coverage.captured_sources ?? '未知'} / ${report.coverage.sources ?? '未知'}` : '未知'}</strong></div><div><span>全平台观察实体</span><strong>{report.entities?.length ?? '未知'}</strong></div></div>{diagnoses[0] && <Link className="visibility-results__text-link" href={intelligence('evidence')}>查看支持观察的证据 ↗</Link>}</article>
          <article className="visibility-results__surface"><div className="visibility-results__section-head"><h2>平台表现</h2><button type="button" onClick={() => setView('platforms')}>详细对照 →</button></div><PlatformTable report={report} platforms={visiblePlatforms} onEvidence={() => setView('sources')} /></article>
          <article className="visibility-results__surface"><div className="visibility-results__section-head"><h2>建议优先处理</h2><span>需复核后执行</span></div>{diagnoses.length ? <ol className="visibility-results__actions">{diagnoses.slice(0, 3).map((item, index) => <li key={item.id || index}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.action?.task || item.finding}</strong><p><AiPlatformLabel platform={item.platform} iconSize={15} /> · {item.action?.success_check || '核对对应的原文证据'}</p></div></li>)}</ol> : <p>当前修订尚无可执行的分平台建议；先核对缺失数据与分析覆盖。</p>}<button type="button" onClick={() => setView('actions')}>查看行动清单 →</button></article>
        </div>}
        {view === 'platforms' && <article className="visibility-results__surface"><div className="visibility-results__section-head"><div><h2>同题平台比较</h2><p>每个平台及指标分别使用自己的有效分母；“实际引用”只统计回答中的引用卡片。</p></div><span>描述性对照</span></div><PlatformTable report={report} platforms={visiblePlatforms} onEvidence={() => setView('sources')} /><p className="audit-meta">本次观察实体包含未登记主体；完整实体对照可在<Link href={`/compare?${query}`}>实体与竞品比较</Link>查看。</p></article>}
        {view === 'sources' && <article className="visibility-results__surface"><div className="visibility-results__section-head"><div><h2>来源文章与证据</h2><p>实际引用、检索候选和正文保存状态分别展示；保存文本不等于原文章全文。</p></div><span>{sources.length} 条观测</span></div>{visibleSourceGap ? <p className="visibility-results__notice">{platform ? '当前平台列表中' : '本次'}有 {visibleSourceGap} 条来源正文未保存或未就绪，可从证据分析核对补采条件。</p> : null}<div className="visibility-results__table-wrap"><table><thead><tr><th>标题与来源</th><th>平台 / 类型</th><th>正文状态</th><th>操作</th></tr></thead><tbody>{sources.map(item => <tr key={item.id}><td><strong>{item.title || '标题未取得'}</strong><p>{item.snippet || '来源摘要未取得'}</p></td><td><AiPlatformLabel platform={item.platform} iconSize={16} /><p>{sourceKinds[item.kind] || '类型待核对'}</p></td><td>{sourceStates[item.fetch_status] || '状态待核对'}</td><td>{item.snapshot_id && report.run_id ? <button onClick={() => setOwner({ kind: 'snapshot', id: item.snapshot_id! })}>查看保存正文 ↗</button> : <Link href={intelligence('sources')}>查看来源详情 ↗</Link>}</td></tr>)}</tbody></table></div>{!sources.length && <p>当前筛选下没有已记录的来源观测，不能据此断言平台没有引用。</p>}<Link className="visibility-results__text-link" href={intelligence('sources')}>查看全部回答、来源与补采入口 →</Link></article>}
        {view === 'actions' && <article className="visibility-results__surface"><div className="visibility-results__section-head"><div><h2>行动工作台</h2><p>先核对平台、原文依据与验收方式，再决定是否开展。</p></div><span>{diagnoses.length} 项待复核</span></div>{diagnoses.length ? <ol className="visibility-results__actions">{diagnoses.map((item, index) => <li key={item.id || index}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{item.action?.task || item.finding}</strong><p><AiPlatformLabel platform={item.platform} iconSize={15} /> · {item.prompt || '平台观察'} · {item.sample_count ?? '未知'} 次独立样本</p><p>{item.action?.success_check || '验收方式待核对'}</p></div><Link href={intelligence('actions')}>查看依据 ↗</Link></li>)}</ol> : <p>当前修订尚未形成可展示的行动建议。若分析覆盖不足，请先补齐数据和核对证据。</p>}<Link className="visibility-results__text-link" href={intelligence('actions')}>进入行动计划与审批 →</Link></article>}
      </>}
    </div>
    {owner && report?.run_id && <SavedContent key={`${report.run_id}-${owner.id}`} projectId={projectId} runId={report.run_id} kind={owner.kind} id={owner.id} close={() => setOwner(null)} />}
  </section>;
}

function PlatformTable({ report, platforms, onEvidence }: { report: CitationReport; platforms: NonNullable<CitationReport['platforms']>; onEvidence: () => void }) {
  return <div className="visibility-results__table-wrap"><table><thead><tr><th>平台</th><th>自有品牌回答提及</th><th>自有品牌实际引用</th><th>证据</th></tr></thead><tbody>{platforms.map(item => <tr key={item.platform}><td><AiPlatformLabel platform={item.platform} iconSize={16} /><p>{item.samples} 份已取得回答</p></td><td>{ownRatio(report, item.platform, 'answer_presence')}</td><td>{ownRatio(report, item.platform, 'cited_card_presence')}</td><td><button type="button" onClick={onEvidence}>查看来源 ↗</button></td></tr>)}</tbody></table>{!platforms.length && <p>当前筛选下暂无可比较的平台结果。</p>}</div>;
}
