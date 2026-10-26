"use client";

import { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useProject } from '@/components/project/project-context';
import { useProjectId } from '@/components/project/use-project-id';
import { ProjectSetupState } from '@/components/project/project-setup-state';
import { PageHeader } from '@/components/ui/page-header';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { SubscriptionRequiredState } from '@/components/billing/subscription-required-state';
import type { MeasurementHistory } from '@/types/measurement-history';
import { MeasurementResults } from './measurement-results';


function ProjectHistory({ projectId, cohortId }: { projectId: string; cohortId: string | null }) {
  const search = useSearchParams(), router = useRouter(), pathname = usePathname();
  const query = new URLSearchParams({ projectId }); if (cohortId !== null) query.set('cohortId', cohortId);
  const response = useSectionFetch<MeasurementHistory>(`/api/integration/measurement-history?${query}`);
  const data = response.data?.schema === 'citation-measurement-history-1' && response.data.project_id === projectId && (cohortId === null || !response.data.enabled || response.data.selected_cohort_id === cohortId) ? response.data : null;
  const selectCohort = (value: string) => { const params = new URLSearchParams(search.toString()); params.set('project', projectId); if (value === 'latest') params.delete('cohortId'); else params.set('cohortId', value); router.replace(`${pathname}?${params}`, { scroll: false }); };
  return <div className="space-y-5"><PageHeader title="趋势与复测" subtitle="同一冻结样本方案下的分平台观测变化" />
    <div className="flex flex-wrap gap-4 text-sm"><button onClick={response.refetch}>刷新复测记录</button><Link href={`/intelligence?project=${encodeURIComponent(projectId)}`}>管理固定样本复测</Link></div>
    <p className="dashboard-surface p-5 text-sm">默认按固定的品牌、原问题和平台进行一次采集，逐项核对前后事实；条件未知、数据缺失与不可比状态分别保留。单轮观察不生成稳定效果区间或改善总分，不证明内容行动造成了变化。历史多轮方案按其原规则回查。</p>
    {response.loading && !data ? <p>正在读取复测记录…</p> : response.locked ? <SubscriptionRequiredState feature="固定样本复测分析" /> : response.error || !data ? <p role="alert">复测记录暂不可用，请核对项目和方案后重试。</p> : !data.enabled ? <p>证据分析尚未启用。</p> : <>
      <p className="text-xs">当前订阅历史范围：{data.history_days} 天。方案列表和结果记录各自受此时间范围约束；固定基线保留用于核对。</p>
      <label className="block text-sm">固定样本方案 <select aria-label="选择趋势方案" className="dashboard-input ml-2 p-2" value={cohortId === null ? 'latest' : data.selected_cohort_id || cohortId} onChange={event => selectCohort(event.target.value)}><option value="latest">跟随最新方案</option>{data.cohorts.map(item => <option key={item.id} value={item.id}>{item.title} · {item.expected_samples} 轮 · {item.created_at}</option>)}</select></label>
      {(data.cohorts_truncated || data.results_truncated) && <p className="text-xs">列表仅展示最近50个方案及本方案最近10条对比，未聚合未展示的记录。</p>}
      {!data.selected_cohort_id ? <p>当前范围尚无固定样本方案，请先在证据分析中冻结基线和实体名单。</p> : <MeasurementResults key={`${projectId}-${data.selected_cohort_id}`} data={data} projectId={projectId} />}
    </>}
  </div>;
}

function HistoryRoot() {
  const { projects, openWizard } = useProject();
  const { projectId, loading } = useProjectId();
  const cohortId = useSearchParams().get('cohortId');
  if (loading) return <p>正在加载项目…</p>;
  return projectId ? <ProjectHistory key={`${projectId}-${cohortId || 'latest'}`} projectId={projectId} cohortId={cohortId} /> : <><PageHeader title="趋势与复测" /><ProjectSetupState featureName="趋势与复测" hasProjects={projects.length > 0} onCreateProject={openWizard} /></>;
}
export function MeasurementHistoryPage() { return <Suspense fallback={<p>正在加载趋势视图…</p>}><HistoryRoot /></Suspense>; }
