"use client";
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { SubscriptionRequiredState } from '@/components/billing/subscription-required-state';
import type { ContentWorkbench } from '@/types/content-workbench';
import { getAiPlatformLabel } from '@/lib/ai-platforms';
import { EvidenceDraftExecution } from './evidence-draft-execution';
import { ManualContentTasks } from './manual-content-tasks';

const states = { ready: '材料读取时有效，操作前仍需复验', stale: '依据已变化，需重新审批', expired: '材料审批已过期', invalid: '材料校验未通过' };
const channels: Record<string, string> = { wechat: '公众号', weibo: '微博', xiaohongshu: '小红书', douyin: '抖音', website: '网站', zhihu: '知乎', toutiao: '头条' };

function BridgePage({ projectId, approvalId }: { projectId: string; approvalId: string | null }) {
  const [pages, setPages] = useState<Array<string | null>>([null]), [manualRefresh, setManualRefresh] = useState(0);
  const cursor = pages[pages.length - 1];
  const query = new URLSearchParams({ projectId }); if (approvalId !== null) query.set('approvalId', approvalId); else if (cursor) query.set('cursor', cursor);
  const response = useSectionFetch<ContentWorkbench>(`/api/integration/content-workbench?${query}`);
  const data = response.data?.schema === 'citation-content-workbench-1' && response.data.project_id === projectId && response.data.approval_id === approvalId && response.data.cursor === cursor ? response.data : null;
  return <section className="dashboard-surface space-y-4 p-5" aria-label="证据内容材料">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">从获批证据材料开始创作</h2><button onClick={response.refetch} className="text-sm text-[var(--color-primary)]">刷新材料</button></div>
    <p className="text-sm text-[var(--text-secondary)]">仅使用已完成草稿材料审批的事实与适用范围。先重新验证，再明确创建草稿或人工任务；不自动发布，也不把内容产出当作可见性效果。</p>
    <div className="flex flex-wrap gap-4 text-sm"><Link href={`/intelligence?project=${encodeURIComponent(projectId)}`}>核验事实并审批材料</Link><Link href={`/suggestions?project=${encodeURIComponent(projectId)}`}>审阅分平台行动计划</Link>{approvalId && <Link href={`/content?project=${encodeURIComponent(projectId)}`}>返回全部获批材料</Link>}</div>
    {response.loading && !data ? <p>正在读取获批材料…</p> : response.locked ? <SubscriptionRequiredState feature="证据内容协作" /> : response.error || !data ? <p role="alert">材料暂不可用，请核对项目与审批记录后重试。</p> : !data.enabled ? <p>证据内容功能尚未启用。可继续从头创建内容，已有数据不会被拼接成获批材料。</p> : <>
      {data.context_sync_pending && <p role="status">品牌配置待同步，材料仅供回查；同步并重新验证后才能继续创作。</p>}
      {!data.items.length && <p>暂无获批草稿材料。请先核对证据、批准行动计划与适用事实，再审批内容材料。</p>}
      {data.items.map(item => <article key={item.id} className="space-y-3 border-t border-[var(--border)] pt-4"><h3 className="font-semibold">{item.title}</h3><p className="text-sm">{states[item.status] || '状态待核对'} · 审批版本 {item.version} · 截止 {new Date(item.expires_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
        {item.execution && <p className="text-sm">{channels[item.execution.channel] || '渠道待核对'} · {item.execution.mode === 'manual_task' ? '人工内容任务' : '生成待审核草稿'} · {item.fact_count} 条获批事实</p>}
        {item.ai_targets.map((target, index) => <p key={index} className="text-sm">目标平台：{getAiPlatformLabel(target.platform)} · {target.prompt}</p>)}
        {item.audit_id && <Link className="block text-sm text-[var(--color-primary)]" href={`/audits/${item.audit_id}/report?project=${encodeURIComponent(projectId)}`}>查看关联审计当前报告</Link>}
        {item.status === 'ready' && <EvidenceDraftExecution key={`${projectId}-${item.id}`} projectId={projectId} approvalId={item.id} disabled={!data.can_prepare} onManualCreated={() => setManualRefresh(old => old + 1)} />}
      </article>)}
      {!data.can_prepare && <p className="text-sm">当前可查看材料；使用材料需要项目写入权限、有效审批和已同步的品牌配置。</p>}
      {!approvalId && <div className="flex gap-4 text-sm"><button disabled={pages.length < 2 || response.loading} onClick={() => setPages(old => old.slice(0, -1))}>上一页材料</button><button disabled={!data.next_cursor || response.loading} onClick={() => setPages(old => [...old, data.next_cursor])}>下一页材料</button></div>}
      <ManualContentTasks key={`${projectId}-${manualRefresh}`} projectId={projectId} readOnly={!data.can_manage_tasks} blocked={data.context_sync_pending} />
    </>}
  </section>;
}
export function ContentEvidenceBridge({ projectId }: { projectId: string }) {
  const approvalId = useSearchParams().get('approvalId');
  return <BridgePage key={`${projectId}-${approvalId ?? 'list'}`} projectId={projectId} approvalId={approvalId} />;
}
