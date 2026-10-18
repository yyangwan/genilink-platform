"use client";
import { AiPlatformLabel } from "@/components/ui/ai-platform-label";
import { useEffect, useRef, useState } from 'react';

type Task = { id: string; status: string; version: number; title: string; channel: string; materialState: string; expiresAt: string;
  ownerUserId: string | null; completionNotes: string | null; deliveryUrl: string | null; aiTargets: Array<{ platform: string; prompt: string }>;
  facts: Array<{ id: string; statement: string; scope: string; source: { url: string } }> };
const labels: Record<string, string> = { pending: '等待领取', in_progress: '人工处理中', completed: '已交付，待内容复核', cancelled: '已取消', website: '网站', zhihu: '知乎', toutiao: '头条' };
const cls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm';

export function ManualContentTasks({ projectId, readOnly = false, blocked = false }: { projectId: string; readOnly?: boolean; blocked?: boolean }) {
  const [tasks, setTasks] = useState<Task[]>([]), [selected, setSelected] = useState('');
  const [reason, setReason] = useState(''), [deliveryUrl, setDeliveryUrl] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [refresh, setRefresh] = useState(0);
  const [history, setHistory] = useState<{ taskId: string; events: Array<{ version: number; action: string; actorId: string; reason: string; createdAt: string }> } | null>(null);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => { const controller = new AbortController();
    fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'manualTasks' })}`, { signal: controller.signal, cache: 'no-store' }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || '人工任务读取失败'); return data; })
      .then(data => { if (!controller.signal.aborted) setTasks(data.data); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    return () => controller.abort();
  }, [projectId, refresh]);
  const update = async (task: Task, taskAction: 'start' | 'complete' | 'cancel') => {
    if (readOnly || blocked && taskAction !== 'cancel') return;
    const payload = { action: 'updateManualTask', taskId: task.id, taskAction, expectedVersion: task.version, reason, ...(taskAction === 'complete' && deliveryUrl ? { deliveryUrl } : {}) };
    const signature = JSON.stringify(payload); if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, ...payload, idempotencyKey: pending.current.key }) });
      const data = await response.json(); if (!response.ok) { if (response.status < 500) pending.current = null; throw new Error(data.error || '人工任务更新失败'); }
      pending.current = null; setMessage('任务状态已保存，交付不代表发布。'); setRefresh(old => old + 1); setHistory(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : '人工任务更新失败'); } finally { setBusy(false); }
  };
  const showHistory = async (taskId: string) => {
    setBusy(true); setMessage('');
    try { const response = await fetch(`/api/integration/intelligence?${new URLSearchParams({ projectId, view: 'manualTasks', taskId })}`, { cache: 'no-store' }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '操作记录读取失败'); setHistory({ taskId, events: data.data.events });
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作记录读取失败'); } finally { setBusy(false); }
  };
  return <section className="space-y-4"><div className="flex items-center justify-between"><h2 className="font-semibold">人工内容任务</h2><button disabled={busy} onClick={() => setRefresh(old => old + 1)} className={cls}>刷新任务列表</button></div>
    <p className="text-sm text-[var(--text-secondary)]">网站、知乎、头条的材料可交由内容团队处理。领取和交付前复验证据；交付仅记录工作完成，发布和效果复测继续单独管理。</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    {tasks.length === 0 && <p className="text-sm text-[var(--text-secondary)]">暂无人工任务，请先审批并创建材料任务。</p>}
    {tasks.map(task => <article key={task.id} className="dashboard-surface space-y-3 p-5"><h3 className="font-semibold">{task.title} · {labels[task.channel] || task.channel}</h3>
      <p className="text-sm">{labels[task.status] || '待确认'} · {task.ownerUserId ? '负责人已领取' : '尚未领取'} · 材料{task.materialState === 'expired' ? '已过期，需重新审批' : '待下一次操作实时复验'}</p>
      {task.aiTargets.map((target, index) => <p key={index} className="text-sm"><AiPlatformLabel platform={target.platform} iconSize={16} /> · {target.prompt}</p>)}
      <details className="text-sm"><summary>查看获批事实及范围</summary>{task.facts.map(fact => <p key={fact.id} className="mt-2">{fact.statement}<span className="block text-[var(--text-secondary)]">仅适用：{fact.scope}</span></p>)}</details>
      <p className="text-xs text-[var(--text-secondary)]">材料期限：{new Date(task.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
      {task.completionNotes && <p className="text-sm">交付说明：{task.completionNotes}</p>}
      {task.deliveryUrl && <a href={task.deliveryUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-[var(--color-primary)]">查看人工交付内容</a>}
      <div className="flex gap-3"><button disabled={busy || readOnly} onClick={() => { setSelected(task.id); setReason(''); setDeliveryUrl(''); }} className={cls}>处理任务</button><button disabled={busy} onClick={() => showHistory(task.id)} className={cls}>操作记录</button></div>
      {!readOnly && selected === task.id && ['pending', 'in_progress'].includes(task.status) && <div className="space-y-3"><textarea aria-label="人工任务处理说明" value={reason} maxLength={2000} disabled={busy} onChange={event => setReason(event.target.value)} placeholder="领取依据、交付说明或取消理由（至少5字）" className={`${cls} w-full`} />
        {task.status === 'in_progress' && <input aria-label="人工任务交付地址" value={deliveryUrl} disabled={busy} onChange={event => setDeliveryUrl(event.target.value)} placeholder="交付的草稿地址（可选）" className={`${cls} w-full`} />}
        <div className="flex flex-wrap gap-3">{task.status === 'pending' && <button disabled={busy || reason.trim().length < 5 || blocked || task.materialState === 'expired'} onClick={() => update(task, 'start')} className={`${cls} disabled:opacity-40`}>领取并开始处理</button>}
          {task.status === 'in_progress' && <button disabled={busy || reason.trim().length < 5 || blocked || task.materialState === 'expired'} onClick={() => update(task, 'complete')} className={`${cls} disabled:opacity-40`}>提交人工交付</button>}
          <button disabled={busy || reason.trim().length < 5} onClick={() => update(task, 'cancel')} className={`${cls} disabled:opacity-40`}>取消任务</button></div>
      </div>}
      {history?.taskId === task.id && <ol className="space-y-2 border-t border-[var(--border)] pt-3 text-sm">{history.events.map(event => <li key={event.version}>{({ created: '创建', start: '领取', complete: '交付', cancel: '取消' } as Record<string, string>)[event.action] || '操作'} · {new Date(event.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}<p className="text-[var(--text-secondary)]">{event.reason} · 操作人 {event.actorId}</p></li>)}</ol>}
    </article>)}
  </section>;
}
