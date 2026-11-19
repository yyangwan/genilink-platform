'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { AiPlatformLabel } from '@/components/ui/ai-platform-label';
import { captureHref, readAuditJson, type AuditCaptureSummary } from '@/lib/visibility/v4-audit';

const analysisLabels: Record<string, string> = {
  waiting_for_capture: '等待采集完成', waiting_for_archive: '等待来源正文归档',
  queued: '等待分析', running: '分析中', failed: '分析失败', completed: '分析已完成', skipped: '采集失败 · 本次不评分',
};
const analysisDetails: Record<string, string> = {
  waiting_for_capture: '已入库的回答可以先查看。',
  waiting_for_archive: '归档收尾后将自动分析一次。',
  queued: '数据已冻结，分析任务正在排队。',
  running: '正在分析已冻结的回答与引用来源。',
  failed: '已采集的回答和归档正文仍可核对。',
  completed: '评分和建议基于本次冻结的样本。',
  skipped: '所有计划样本均未取得回答，本次未启动分析。',
};

export function CaptureSummary({ data, insightHref }: { data: AuditCaptureSummary; insightHref: string }) {
  const { capture, archive, analysis } = data;
  if (!capture || !archive || !analysis) return null;
  const collecting = capture.state === 'collecting';
  const archiving = !collecting && archive.state === 'archiving';
  const failed = capture.state === 'failed';
  const title = collecting ? '回答采集中' : archiving ? '来源正文归档中' : failed ? '采集失败' : '采集已结束';
  return <section className="citation-panel v4-panel" aria-label="采集进度">
    <div className="v4-row"><div><h2>采集进度</h2>
      <p className="v4-note">审计 #{data.audit_id} · {collecting ? '已入库的回答可先查阅。' : archiving ? '回答已收尾，正在归档正文。' : failed ? '所有平台均未取得回答。' : '可查阅本次实际采集记录。'}</p></div>
      <span role="status" className="v4-chip" data-tone={collecting || archiving || failed ? 'warn' : 'ok'}>{title}</span>
    </div>
    <div className="v4-metrics">
      <div><span>回答已入库</span><strong>{capture.received} <small>/ {capture.planned}</small></strong></div>
      <div><span>未取得回答</span><strong>{capture.failed}</strong></div>
      <div><span>正文已归档 / 取得引用</span><strong>{archive.archived} <small>/ {archive.observed}</small></strong></div>
    </div>
    <div className="v4-table-wrap"><table className="citation-table">
      <thead><tr><th scope="col">平台</th><th scope="col">计划样本</th><th scope="col">回答入库</th><th scope="col">采集失败</th><th scope="col">待完成</th></tr></thead>
      <tbody>{data.platforms?.map(row => <tr key={row.platform}><td><AiPlatformLabel platform={row.platform} /></td>
        <td>{row.planned}</td><td>{row.received}</td><td>{row.failed}</td><td>{row.pending}</td></tr>)}</tbody>
    </table></div>
    <div className="v4-row v4-panel-footer">
      <span className="v4-note">分析状态 · {analysisLabels[analysis.state] || '待查询'}</span>
      <Link className="dashboard-button dashboard-button--secondary" href={insightHref}>{analysis.state === 'completed' ? '查看审计洞察' : '查看分析状态'}</Link>
    </div>
  </section>;
}

export function AnalysisStatusPanel({ projectId, auditId, capture, onRetry, refreshing }: {
  projectId: string; auditId: string; capture: AuditCaptureSummary | null; onRetry: () => void; refreshing: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const analysis = capture?.analysis;
  const failedAttempt = analysis?.can_retry ? analysis.attempt_id : null;
  const state = analysis?.state;
  async function retry() {
    if (!failedAttempt || inFlight.current || refreshing) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await readAuditJson('/api/integration/intelligence?projectId=' + encodeURIComponent(projectId), undefined, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action: 'retryAnalysis', auditId, failedAttemptId: failedAttempt }),
      });
      onRetry();
    } catch (error) {
      setError(error instanceof Error ? error.message : '分析重试暂不可用。');
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }
  return <section className="citation-panel v4-panel" aria-label="分析状态">
    <div className="v4-row"><h2>分析状态</h2>
      {state && <span className="v4-chip" data-tone={state === 'completed' ? 'ok' : 'warn'} role="status">{analysisLabels[state] || '待查询'}</span>}
    </div>
    {state ? <p className="v4-note">{analysis.failure_reason === 'analysis_interrupted' && '分析运行已中断。'}{analysisDetails[state]}
      {analysis.attempt_no ? ` 当前为第 ${analysis.attempt_no} 次分析。` : ''}</p>
      : <p className="v4-note">{refreshing ? '正在读取分析状态…' : auditId ? '当前审计暂无 v4 分析状态。' : '选择一个审计后可查看分析状态。'}</p>}
    {error && <p className="v4-warn" role="alert">{error}</p>}
    {!!auditId && <div className="v4-controls">
      {failedAttempt && capture?.can_write && <button type="button" className="dashboard-button dashboard-button--primary" disabled={busy || refreshing} onClick={retry}>
        {busy ? '正在提交重试…' : '用本次数据重新分析'}
      </button>}
      {state !== 'completed' && <Link className="dashboard-button dashboard-button--secondary" href={captureHref(projectId, auditId)}>查看原始采集记录</Link>}
    </div>}
  </section>;
}
