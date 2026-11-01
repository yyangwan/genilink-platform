"use client";

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { analysisTargets } from '@/lib/visibility/analysis-scope';
import { readTaskScope, setTaskScope } from '@/lib/visibility/task-view';
import type { CitationReport } from '@/types/citation-report';
import type { EvidenceRun } from '@/types/intelligence';
import { AnalysisScopeBar } from './analysis-scope-bar';

export function CaptureAnalysisScope({ projectId, report }: { projectId: string; report: CitationReport | null }) {
  const search = useSearchParams().toString();
  const scope = useMemo(() => readTaskScope(projectId, search), [projectId, search]);
  const runId = report?.entitlementLevel !== 'basic' ? report?.run_id : undefined;
  const detail = useSectionFetch<EvidenceRun>(runId ? `/api/integration/intelligence?${new URLSearchParams({ view: 'detail', projectId, runId })}` : null);
  const run = detail.data?.id === runId && detail.data?.audit_id === report?.audit_id ? detail.data : null;
  const mismatch = !!detail.data && !detail.loading && !run;
  const initialized = useRef(new Set<string>());
  useEffect(() => {
    if (!run) return;
    if (scope.own) initialized.current.add(run.id);
    if (initialized.current.has(run.id)) return;
    initialized.current.add(run.id);
    const own = analysisTargets(run).filter(row => row.role === 'own' && row.identity_status === 'confirmed');
    if (own.length === 1) setTaskScope(projectId, { own: own[0].target_id });
  }, [projectId, run, scope.own]);

  return <div className="visibility-collection__scope">
    {run ? <AnalysisScopeBar run={run} scope={scope} onChange={change => setTaskScope(projectId, change)} /> : <section className="citation-panel citation-pad analysis-scope" aria-label="统一比较范围">
      <div className="analysis-scope-controls">{['自有品牌', '对比品牌', '目标平台', '需求场景'].map((name, index) => <label key={name}>{name}<select aria-label={name} disabled><option>{index === 2 ? '全部平台' : index === 3 ? '全部场景' : '等待分析范围'}</option></select></label>)}</div>
      <p className="citation-muted">{detail.locked || report?.entitlementLevel === 'basic' ? '完整分析权限可查看品牌与场景比较范围。' : mismatch ? '分析范围与当前审计不匹配，请刷新后重试。' : detail.error ? '比较范围暂不可用，采集状态仍可查看。' : runId ? '正在读取本次审计的比较范围…' : '完成一次审计后，可按品牌、平台与场景查看结果。'}</p>
    </section>}
    <p className="visibility-collection__scope-note">比较选择随审计洞察保留；本次采集仍按下方提示词覆盖全部平台。</p>
  </div>;
}
