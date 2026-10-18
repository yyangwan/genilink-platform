"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Radio, AlertCircle } from 'lucide-react';
import { getAiPlatformLabel } from '@/lib/ai-platforms';

export interface CaptureStatus {
  audit_id: string; status: string; expected_samples: number; sealed: number; failed: number;
  source_pending: number; analysis_pending: number; refresh_pending: boolean; published_run_id: string | null;
  analysis_status?: string | null; semantic_error_count?: number;
  source_failed_documents?: number; source_unresolved?: number;
  refresh_waiting?: boolean; refresh_available_at?: string | null; refresh_wait_reason?: string | null;
  refresh_status?: string | null;
  samples?: Array<{ id: string; platform: string; status: string }>;
}

function isStatus(value: CaptureStatus, auditId: string): boolean {
  return value?.audit_id === auditId && typeof value.status === 'string' &&
    [value.expected_samples, value.sealed, value.failed, value.source_pending, value.analysis_pending].every(n => Number.isInteger(n) && n >= 0);
}

export function CaptureProgress({ projectId, auditId, onPublished }: { projectId: string; auditId: string; onPublished?: (id: string) => void }) {
  // Remounting by project + audit prevents stale data from leaking between task contexts.
  return <TaskProgress key={`${projectId}:${auditId}`} projectId={projectId} auditId={auditId} onPublished={onPublished} />;
}

function TaskProgress({ projectId, auditId, onPublished }: { projectId: string; auditId: string; onPublished?: (id: string) => void }) {
  const [data, setData] = useState<CaptureStatus | null>(null);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      setChecking(true);
      try {
        const response = await fetch(`/api/integration/intelligence?${new URLSearchParams({ view: 'capture', projectId, auditId })}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? '当前账号无权查询此任务，请检查项目权限。' : '暂时无法同步任务状态。');
        const next: CaptureStatus = await response.json();
        if (!isStatus(next, auditId)) throw new Error('任务状态返回不完整，正在等待重新同步。');
        if (controller.signal.aborted) return;
        setData(next); setUpdated(new Date()); setError('');
        if (['pending', 'running'].includes(next.status) || next.source_pending > 0 || next.analysis_pending > 0 || next.refresh_pending) timer = setTimeout(poll, 5000);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : '暂时无法同步任务状态。');
        timer = setTimeout(poll, 15000);
      } finally { if (!controller.signal.aborted) setChecking(false); }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [projectId, auditId, refresh]);
  const published = data?.published_run_id;
  useEffect(() => { if (published) onPublished?.(published); }, [published, onPublished]);
  const waiting = data?.status === 'pending';
  const running = data && ['pending', 'running'].includes(data.status);
  const title = error ? '暂时无法同步任务状态' : !data ? '正在读取采集任务' : running ? (waiting ? '任务已创建，等待执行' : '正在采集平台回答') : data.failed ? '回答采集已结束，部分样本未成功' : '回答采集已结束';
  const waitingForRefresh = data?.refresh_waiting && !data.analysis_pending;
  const analysisLabel = !data ? '' : waitingForRefresh
    ? (data.refresh_wait_reason === 'enhancement_quota' ? '等待下一次增量分析额度' : '等待合并最新数据')
    : data.refresh_status === 'failed' ? '最新数据刷新失败，需要重试'
    : data.analysis_pending || (data.refresh_pending && data.refresh_status !== null) ? '正在处理分析任务'
    : data.analysis_status === 'failed' ? '分析失败，尚未产出本次结果'
    : data.published_run_id ? (data.analysis_status === 'partial' ? '已产出部分分析，存在证据缺口' : '已有分析修订，可前往查看') : '等待可用分析修订';
  const platforms = [...new Set(data?.samples?.map(sample => sample.platform) || [])];
  return <section className="capture-progress" aria-label="当前采集任务" aria-busy={checking}>
    <div className="capture-progress__head"><div><p className="audit-eyebrow">当前任务 · 审计 #{auditId}</p><h2>{error ? <AlertCircle size={19} /> : <Radio size={19} />}{title}</h2><p className="audit-meta">{updated ? `${error ? '最后成功同步' : '最近同步'} ${updated.toLocaleTimeString('zh-CN')} · ${error ? '状态可能滞后' : running ? '自动刷新中' : '可回查本次任务'}` : '查询已有任务，不会重复创建采集'}</p></div>
      <div className="capture-progress__count">{data ? <><strong>{data.sealed}</strong><span> / {data.expected_samples} 份回答</span></> : <span>等待状态同步</span>}</div></div>
    {data && <><progress aria-label="回答采集进度" value={data.sealed} max={Math.max(data.expected_samples, 1)} /><div className="capture-stages">
      <div><h3>平台回答</h3><strong>{data.sealed} 已入库 · {data.failed} 未成功</strong><p>未完成与失败样本不计为品牌缺席</p></div>
      <div><h3>来源正文归档</h3><strong>{data.source_pending ? `${data.source_pending} 项待处理` : '当前无待处理项'}</strong><p>{data.source_failed_documents || data.source_unresolved ? `${data.source_failed_documents || 0} 个来源正文未获取 · ${data.source_unresolved || 0} 条来源缺少精确链接` : '与回答采集可并行；不代表全文完整'}</p></div>
      <div><h3>证据分析</h3><strong>{analysisLabel}</strong><p>{waitingForRefresh && data.refresh_available_at ? `预计 ${new Date(data.refresh_available_at).toLocaleString('zh-CN')} 继续；当前未在执行` : data.semantic_error_count ? `${data.semantic_error_count} 个文本片段解析失败，其他片段仍保留` : '回答采集完成不等于报告已完成'}</p></div>
    </div></>}
    {!!platforms.length && <details className="capture-platforms"><summary>查看分平台采集进度 <span>{platforms.length} 个平台</span></summary><div>{platforms.map(platform => {
      const samples = data!.samples!.filter(sample => sample.platform === platform);
      return <div className="capture-platform-row" key={platform}><strong>{getAiPlatformLabel(platform)}</strong><span>{samples.filter(sample => sample.status === 'sealed').length} / {samples.length} 已入库</span><span>{samples.filter(sample => sample.status === 'failed').length} 未成功</span></div>;
    })}</div></details>}
    <div className="capture-progress__footer"><p role={error ? 'alert' : undefined}>{error ? `${error} 状态查询异常不代表任务失败，已有进度仍保留。` : '可以离开页面，稍后继续查看。本面板分别展示采集、正文和分析状态。'}</p><div className="flex shrink-0 flex-wrap gap-2"><button type="button" disabled={checking} onClick={() => setRefresh(value => value + 1)} className="dashboard-button dashboard-button--secondary"><RefreshCw size={14} className={checking ? 'animate-spin' : ''} />{error ? '重新查询' : '刷新状态'}</button><Link className="dashboard-button dashboard-button--primary" href={`/intelligence?${new URLSearchParams({ project: projectId, auditId })}`}>查看本次证据</Link></div></div>
  </section>;
}
