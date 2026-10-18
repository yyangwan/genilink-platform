"use client";

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useProject } from '@/components/project/project-context';
import { useProjectId } from '@/components/project/use-project-id';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { PageHeader } from '@/components/ui/page-header';
import { SubscriptionRequiredState } from '@/components/billing/subscription-required-state';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import type { AnalysisWorkspace, ObservationContext, WorkspaceView } from '@/types/analysis-workspace';
import { ActionPlans } from './action-plans';
import { EvidenceComparisons } from './evidence-comparisons';
import { PlatformDiagnoses } from './platform-diagnoses';
import { SavedContent } from './saved-content';
import { EntityComparison } from './entity-comparison';
import { StrategicEvidence } from './strategic-evidence';

const titles = { insights: '内容洞察', suggestions: '优化建议', compare: '实体与竞品比较', strategic: '战略智能' };
const states: Record<string, string> = { pending: '等待采集', running: '采集或分析中', completed: '采集完成', partial: '部分完成', failed: '失败', needs_analysis: '尚未分析', queued: '分析排队中', ready: '分析完成', stale: '快照待更新' };
const kinds: Record<string, string> = { answer: '回答提及', answer_reference: '实际引用', search_candidate: '检索候选', text_link: '文本链接', unknown: '类别未知', named_inference: '推测来源' };
const owners: Record<string, string> = { answer: '平台回答', citation: '来源卡片', snapshot: '已保存正文' };
const sentiments: Record<string, string> = { positive: '正面', neutral: '中性', negative: '负面', mixed: '混合', unknown: '未知' };

function Contexts({ items, platform }: { items: ObservationContext[]; platform: string }) {
  return <p className="mt-2 text-xs text-[var(--text-secondary)]">{items.filter(item => !platform || item.platform === platform).map(item => `${getAiPlatformLabel(item.platform)} / ${kinds[item.kind] || '类别待核对'} / 回答 ${item.response_id}${item.source_id ? ` / 卡片 ${item.source_id}` : ''}`).join('；')}</p>;
}

function WorkspaceBody({ data, projectId, view, refresh }: { data: AnalysisWorkspace; projectId: string; view: WorkspaceView; refresh: () => void }) {
  const [platform, setPlatform] = useState('');
  const [entityId, setEntityId] = useState('');
  const [owner, setOwner] = useState<{ kind: string; id: string } | null>(null);
  const report = data.report;
  const open = (kind: string, id: string) => setOwner({ kind, id });
  const platformNames = Array.from(new Set([...(report?.platforms || []).map(row => row.platform), ...(report?.sources || []).map(row => row.platform)]));
  if (!report) return <p>尚无审计记录，请先配置提示词并明确发起采集。</p>;
  const diagnoses = (report.diagnoses || []).filter(item => !platform || item.platform === platform);
  const evidence = (report.evidence || []).filter(item => !platform || item.platform === platform);
  const reviews = Object.fromEntries((report.evidence || []).filter(item => item.human_review).map(item => [item.id, item.human_review!]));
  const mentions = (data.observations?.mentions || []).filter(item => (!entityId || item.entity_id === entityId) && item.contexts.some(context => !platform || context.platform === platform));
  const claims = (data.observations?.claims || []).filter(item => item.contexts.some(context => !platform || context.platform === platform));
  return <div className="space-y-5">
    <section className="dashboard-surface p-5"><h2 className="font-semibold">审计 #{report.audit_id} · {states[report.status] || '状态待核对'}{report.revision != null && ` · 修订 ${report.revision}`}</h2>
      {data.selected_audit_id !== data.latest_audit_id && <p className="mt-2 text-sm">正在查看历史审计，其观察不代表最新平台表现。</p>}
      {data.processing && <p className="mt-2 text-sm">该次采集或分析仍在进行，当前内容不是完整结果。</p>}
      {!report.snapshot_current && <p className="mt-2 text-sm text-[var(--color-warning)]">当前快照尚未就绪或已过期，已有观察仅供回查。{data.context_sync_pending ? '品牌配置尚未同步。' : ''}请更新后再作为最新行动依据。</p>}
      <p className="mt-2 text-sm text-[var(--text-secondary)]">回答、卡片和保存正文分别保留；检索候选不等于实际引用，正文提及不证明模型采用了该内容。原文观点和模型判断需核验，计划审批不授权发布。</p>
    </section>
    {report.entitlementLevel === 'basic' ? <section className="dashboard-surface space-y-3 p-5"><p>当前为基础分析视图，完整实体、来源证据与行动功能需完整分析权限。</p>{report.platforms?.map(item => <p key={item.platform}>{getAiPlatformLabel(item.platform)} · {item.samples} 次已取得回答</p>)}{report.coverage && <p>已保存来源正文 {report.coverage.captured_sources ?? '未知'}/{report.coverage.sources ?? '未知'}，保存不代表文章全文完整。</p>}</section> : !report.run_id || !['ready', 'partial', 'stale'].includes(report.status) ? <p>暂无可用的分析快照，请先在证据分析中完成该次审计的分析。</p> : <>
      <label className="block text-sm">平台筛选 <select aria-label="分析平台" value={platform} onChange={event => setPlatform(event.target.value)} className="ml-2 dashboard-input p-2"><option value="">全部平台</option>{platformNames.map(value => <option key={value} value={value}>{getAiPlatformLabel(value)}</option>)}</select></label>
      {view === 'strategic' ? <StrategicEvidence report={report} projectId={projectId} platform={platform} onOpen={open} /> : view === 'insights' || view === 'compare' ? <>
        {view === 'compare' && <EntityComparison report={report} platform={platform} onEntity={setEntityId} />}
        <section className="dashboard-surface p-5"><h2 className="font-semibold">同题平台采集分组</h2>{data.observations?.prompt_platforms.filter(item => !platform || item.platform === platform).map(item => <p key={`${item.platform}-${item.prompt_hash}`} className="mt-3 text-sm">{getAiPlatformLabel(item.platform)} · {item.prompt} · {item.sample_count} 次样本 · {item.comparable ? '分组条件已记录' : '分组条件尚不完整'}</p>)}<p className="mt-3 text-xs">分组用于回查，不代表跨平台结果具有因果可比性；效果评估请使用固定样本复测。</p></section>
        <section className="dashboard-surface space-y-3 p-5"><h2 className="font-semibold">全部观察实体的原文提及</h2><label className="text-sm">提及实体筛选 <select aria-label="提及实体" className="ml-2 dashboard-input p-2" value={entityId} onChange={event => setEntityId(event.target.value)}><option value="">全部实体</option>{report.entities?.map(entity => <option key={entity.id} value={entity.id}>{entity.name} · {entity.identity_status === 'confirmed' ? '已确认' : '待核对'}</option>)}</select></label>
          {!mentions.length && <p>当前筛选没有可展示的提及，不能据此断言未采集内容中没有该实体。</p>}
          {mentions.map(item => <article key={item.id} className="border-t border-[var(--border)] pt-3"><p className="text-sm">{item.entity_name} · {owners[item.owner_kind] || '原文片段'} · 片段情绪：{sentiments[item.sentiment] || '未知'}{item.identity_ambiguity ? ' · 同名归属待核对' : ''}</p><blockquote className="mt-2 whitespace-pre-wrap break-words text-sm">{item.quote}</blockquote><Contexts items={item.contexts} platform={platform} /><button onClick={() => open(item.owner_kind, item.owner_id)} className="mt-2 text-sm text-[var(--color-primary)]">查看提及上下文</button></article>)}
        </section>
        <section className="dashboard-surface p-5"><h2 className="font-semibold">原文观点与主题 · 待核验</h2>{!claims.length && <p className="mt-2 text-sm">尚无可展示的已分析观点。</p>}{claims.map((item, index) => <article key={`${item.segment_id}-${index}`} className="mt-3 border-t border-[var(--border)] pt-3"><p className="text-sm">{item.subject} · {item.topic} · {owners[item.owner_kind] || '原文'}</p><blockquote className="mt-2 whitespace-pre-wrap text-sm">{item.quote}</blockquote><Contexts items={item.contexts} platform={platform} /><button onClick={() => open(item.owner_kind, item.owner_id)} className="mt-2 text-sm text-[var(--color-primary)]">查看观点上下文</button></article>)}</section>
        <h2 className="font-semibold">回答与来源的证据对照</h2>{!evidence.length && <p>当前没有可核验的回答与来源配对，不推断内容准确。</p>}
        <EvidenceComparisons key={platform} items={evidence} run={{ id: report.run_id, claim_reviews: reviews }} projectId={projectId} readOnly={!data.can_review} onSaved={refresh} onSourceOpen={id => open('snapshot', id)} />
      </> : <>
        <h2 className="font-semibold">分平台诊断与优化方向</h2>{!diagnoses.length && <p>当前平台尚无可展示的诊断；需要先完成采集与分析。</p>}
        <PlatformDiagnoses items={diagnoses} onAnswerOpen={id => open('answer', id)} />
        {diagnoses.map((item, index) => <details key={item.id || index} className="dashboard-surface p-4"><summary className="text-sm">{getAiPlatformLabel(item.platform)} · 回查本组来源证据</summary>{evidence.filter(proof => item.evidence_ids?.includes(proof.id)).map(proof => <div key={proof.id} className="mt-3 text-sm"><blockquote>回答：{proof.answer_quote}</blockquote><blockquote>来源：{proof.source_quote || '暂无可核验片段'}</blockquote><button className="mt-2 text-[var(--color-primary)]" onClick={() => open('snapshot', proof.snapshot_id)}>查看证据正文</button></div>)}{(report.sources || []).filter(source => source.platform === item.platform && item.response_ids?.includes(source.response_id)).map(source => <p className="mt-2 text-sm" key={source.id}>{source.title || '无标题来源'} · {kinds[source.kind] || '类别待核对'} <button className="text-[var(--color-primary)]" onClick={() => open('citation', source.id)}>查看来源卡片</button></p>)}</details>)}
        {!data.can_act && <p className="text-sm">当前仅可查看行动状态。创建或审批需项目写入权限、完整证据分析权限及当前有效快照。</p>}
        <ActionPlans run={{ id: report.run_id, summary: { diagnoses: report.diagnoses } }} projectId={projectId} readOnly={!data.can_act} platform={platform} />
      </>}
      <section className="dashboard-surface p-5"><h2 className="font-semibold">分平台来源清单</h2>{(report.sources || []).filter(item => !platform || item.platform === platform).map(item => <article className="mt-3 border-t border-[var(--border)] pt-3 text-sm" key={item.id}><p>{getAiPlatformLabel(item.platform)} · {kinds[item.kind] || '类别待核对'} · {item.fetch_status === 'captured' ? '正文已保存，全文完整度仍需核对' : '正文未就绪或无法取得'}</p><p className="mt-2">{item.title || '无标题来源'}</p><p className="mt-2 whitespace-pre-wrap">{item.snippet}</p><button className="mr-4 mt-2 text-[var(--color-primary)]" onClick={() => open('citation', item.id)}>查看来源卡片</button>{item.snapshot_id && <button className="mt-2 text-[var(--color-primary)]" onClick={() => open('snapshot', item.snapshot_id!)}>查看保存正文</button>}</article>)}</section>
      {owner && <SavedContent key={`${report.run_id}-${owner.kind}-${owner.id}`} projectId={projectId} runId={report.run_id} kind={owner.kind} id={owner.id} close={() => setOwner(null)} />}
    </>}
  </div>;
}

function ProjectWorkspace({ projectId, view, auditId }: { projectId: string; view: WorkspaceView; auditId: string | null }) {
  const search = useSearchParams(), router = useRouter(), pathname = usePathname();
  const query = new URLSearchParams({ projectId, view }); if (auditId !== null) query.set('auditId', auditId);
  const response = useSectionFetch<AnalysisWorkspace>(`/api/integration/analysis-workspace?${query}`);
  const data = response.data?.schema === 'citation-workspace-1' && response.data.project_id === projectId && response.data.view === view && (auditId === null || !response.data.enabled || response.data.selected_audit_id === auditId) ? response.data : null;
  const { loading, refetch } = response;
  useEffect(() => { if (!data?.processing || loading) return; const timer = setTimeout(refetch, 10000); return () => clearTimeout(timer); }, [data, loading, refetch]);
  const selectAudit = (value: string) => { const params = new URLSearchParams(search.toString()); params.set('project', projectId); if (value === 'latest') params.delete('auditId'); else params.set('auditId', value); router.replace(`${pathname}?${params}`, { scroll: false }); };
  return <div className="audit-workspace space-y-5"><PageHeader title={titles[view]} subtitle="全部信息、分平台原文证据与审计修订" /><div className="audit-toolbar"><button className="dashboard-button dashboard-button--secondary" onClick={refetch}>刷新分析视图</button><Link href={`/intelligence?project=${encodeURIComponent(projectId)}`}>证据分析与固定样本复测</Link>{data?.selected_audit_id && <Link href={`/audits/${data.selected_audit_id}/report?project=${encodeURIComponent(projectId)}`}>查看本次报告</Link>}</div>
    {loading && !data ? <p>正在读取分析快照…</p> : response.locked ? <SubscriptionRequiredState feature={titles[view]} /> : response.error || !data ? <p role="alert">当前分析视图暂不可用，请检查项目与审计后重试。</p> : !data.enabled ? <p>证据分析功能尚未启用。</p> : <>
      {!!data.audits.length && <label className="block text-sm">审计快照 <select aria-label="选择审计快照" className="ml-2 dashboard-input p-2" value={auditId === null ? 'latest' : data.selected_audit_id || auditId} onChange={event => selectAudit(event.target.value)}><option value="latest">跟随最新审计</option>{data.audits.map(item => <option key={item.id} value={item.id}>#{item.id} · {states[item.status] || '待核对'} · {item.created_at}</option>)}</select></label>}
      {data.audits_truncated && <p className="text-xs">选择器展示最近30次审计；更早审计可从审计记录进入，不回填旧测试数据。</p>}
      <WorkspaceBody key={`${projectId}-${data.selected_audit_id}-${data.report?.run_id || 'pending'}`} data={data} projectId={projectId} view={view} refresh={refetch} />
    </>}
  </div>;
}

function WorkspaceRoot({ view }: { view: WorkspaceView }) {
  const { projects, openWizard } = useProject();
  const { projectId, loading } = useProjectId();
  const search = useSearchParams();
  const auditId = search.get('auditId');
  if (loading) return <p>正在加载项目…</p>;
  return projectId ? <ProjectWorkspace key={`${projectId}-${view}-${auditId || 'latest'}`} projectId={projectId} view={view} auditId={auditId} /> : <><PageHeader title={titles[view]} /><ProjectSetupState featureName={titles[view]} hasProjects={projects.length > 0} onCreateProject={openWizard} /></>;
}
export function AnalysisWorkspacePage({ view }: { view: WorkspaceView }) { return <Suspense fallback={<p>正在加载分析工作台…</p>}><WorkspaceRoot view={view} /></Suspense>; }
