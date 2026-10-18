"use client";
import { AiPlatformLabel } from "@/components/ui/ai-platform-label";

import Link from 'next/link';
import type { CitationDashboard } from '@/types/citation-dashboard';
import { sourceReasons } from './presence-metrics';

const states: Record<string, string> = { pending: '等待采集', running: '采集中', completed: '采集完成', partial: '部分完成', failed: '失败', needs_analysis: '尚未生成分析', queued: '分析排队中', ready: '分析完成', stale: '快照待更新' };
const metrics = [{ id: 'answer_presence', name: '回答提及' }, { id: 'cited_card_presence', name: '实际引用卡片' }, { id: 'cited_archive_presence', name: '已存引用正文' }, { id: 'candidate_card_presence', name: '检索候选卡片' }];
const roles: Record<string, string> = { own: '自有品牌', competitor: '已登记竞品', comparison: '仅用于对比', unregistered: '未登记主体' };
const identities: Record<string, string> = { confirmed: '已确认', excluded: '已排除', provisional: '待核对' };
const reason = (value: string) => sourceReasons[value] || ({ incomplete_answer: '回答未完整采集', ambiguous_identity: '实体归属待核对', analysis_incomplete: '分析未完成' }[value] || '待核对');

export function VisibilityOverview({ data, projectId, compact = false }: { data: CitationDashboard; projectId: string; compact?: boolean }) {
  const report = data.report;
  const projectQuery = new URLSearchParams({ project: projectId, ...(data.latest_audit ? { auditId: data.latest_audit.id } : {}) }).toString();
  const platforms = Array.from(new Set([...(data.latest_audit?.platforms || []), ...(report?.platforms || []).map(row => row.platform)]));
  if (!data.enabled) return <section className="dashboard-surface p-5"><h2 className="font-semibold">证据分析尚未启用</h2><p className="mt-2 text-sm">当前没有可用的新口径分析结果。</p></section>;
  return <section aria-label="最新审计概览" className="dashboard-surface space-y-4 p-5">
    <div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">最新审计{data.latest_audit ? ` #${data.latest_audit.id}` : ' · 尚无记录'}</h2><Link className="text-sm text-[var(--color-primary)]" href={`/intelligence?${projectQuery}`}>采集与证据分析</Link></div>
    {data.context_sync_pending && <p role="status" className="text-sm text-[var(--color-warning)]">品牌配置待同步，请先同步配置后采集或分析。</p>}
    {data.latest_audit ? <p className="text-sm">{states[data.latest_audit.status] || '采集状态待核对'} · {new Date(data.latest_audit.created_at).toLocaleString("zh-CN")} · {states[report?.status || 'needs_analysis'] || '分析状态待核对'}{report?.revision != null && ` · 修订 ${report.revision}`}</p> : <p>尚未创建审计，请先添加提示词并设置独立采集轮次。</p>}
    {data.processing && !data.waiting && <p role="status" className="text-sm text-[var(--color-primary)]">采集或分析正在进行；这里只展示最新审计已取得的样本，尚不是完整结果。</p>}
    {data.waiting && <p role="status" className="text-sm text-[var(--color-warning)]">后续任务已排期，当前处于等待；具体原因与继续时间可在采集进度中查看。</p>}
    {report && !report.snapshot_current && <p className="text-sm text-[var(--color-warning)]">当前快照尚未就绪或需要更新，已有内容仅供回查，不作为最新优化结论。</p>}
    {report && <><div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div><p className="text-xs text-[var(--text-secondary)]">本快照观察实体</p><strong>{report.entities ? report.entities.length : '等待实体分析'}</strong></div>
      <div><p className="text-xs text-[var(--text-secondary)]">已取得独立回答</p><strong>{report.platforms ? report.platforms.reduce((sum, row) => sum + row.samples, 0) : '尚未就绪'}</strong></div>
      <div><p className="text-xs text-[var(--text-secondary)]">已保存来源正文</p><strong>{report.coverage ? `${report.coverage.captured_sources ?? '未知'}/${report.coverage.sources ?? '未知'}` : '尚未就绪'}</strong></div>
      <div><p className="text-xs text-[var(--text-secondary)]">已分析字符</p><strong>{report.coverage ? `${report.coverage.analyzed_characters ?? '未知'}/${report.coverage.total_characters ?? '未知'}` : '尚未就绪'}</strong></div>
    </div><p className="text-xs text-[var(--text-secondary)]">指标均来自同一审计修订，各平台和各指标独立计算有效分母；缺失不记为零，已存正文不代表原文章全文。不同审计的变化请通过固定样本复测核验。</p></>}
    {!!platforms.length && <div className="grid gap-3 lg:grid-cols-2">{platforms.map(platform => {
      const row = report?.platforms?.find(item => item.platform === platform);
      return <article className="rounded border border-[var(--border)] p-3" key={platform}><h3 className="font-semibold"><AiPlatformLabel platform={platform} iconSize={16} /> · {row ? `${row.samples} 次已取得回答` : '回答样本未知或尚未取得'}</h3>
        {row?.metrics.length ? <><div className="mt-2 flex flex-wrap gap-4 text-xs">{metrics.map(metric => { const population = row.metrics.find(item => item.metric === metric.id); return <p key={metric.id}>{metric.name}：{population ? `有效 ${population.included.length} / 排除 ${population.excluded.length}` : '尚未就绪'}</p>; })}</div>
          <details className="mt-3"><summary className="cursor-pointer text-sm">查看全部实体与独立分母</summary><div className="overflow-x-auto"><table className="mt-2 w-full text-left text-xs"><thead><tr><th>观察实体 / 本快照身份</th>{metrics.map(metric => <th key={metric.id}>{metric.name}</th>)}</tr></thead><tbody>{(report?.entities || []).map(entity => <tr className="border-t border-[var(--border)]" key={entity.id}><td className="py-2">{entity.name}<p>{identities[entity.identity_status] || '待核对'} · {roles[entity.role] || '未登记主体'}</p></td>{metrics.map(metric => { const value = row.metrics.find(item => item.metric === metric.id)?.entities.find(item => item.entity_id === entity.id); return <td key={metric.id}>{value?.denominator ? `${value.numerator}/${value.denominator}（${(value.numerator / value.denominator * 100).toFixed(1)}%）` : '未知（无有效样本）'}</td>; })}</tr>)}</tbody></table></div>{!compact && row.metrics.map(metric => <details className="mt-2 text-xs" key={metric.metric}><summary>{metrics.find(item => item.id === metric.metric)?.name || metric.metric} · 排除原因</summary>{metric.excluded.map(item => <p key={item.response_id}>{item.response_id} · {reason(item.reason)}</p>)}</details>)}</details></> : <p className="mt-2 text-sm">{report?.entitlementLevel === 'basic' ? '基础报告提供平台样本概览；完整实体与证据需完整报告权限。' : '该平台尚无可用分析分母。'}</p>}</article>;
    })}</div>}
    {!!report?.diagnoses?.length && <details><summary className="cursor-pointer font-semibold">分平台待复核建议 · {report.diagnoses.length} 条</summary>{!report.snapshot_current && <p className="mt-2 text-sm">以下为历史快照观察，请更新后再作为执行依据。</p>}{report.diagnoses.map((item, index) => <div key={item.id || index} className="mt-3 border-t border-[var(--border)] pt-3 text-sm"><p><AiPlatformLabel platform={item.platform} iconSize={16} /> · {item.prompt || '平台观察'}</p><p className="mt-1">{item.finding}</p>{item.action && <p className="mt-1">建议任务：{item.action.task}</p>}</div>)}</details>}
    {data.latest_audit && <Link className="inline-block text-sm text-[var(--color-primary)]" href={`/audits/${data.latest_audit.id}/report?${projectQuery}`}>查看本次在线报告、来源证据与 PDF</Link>}
  </section>;
}
