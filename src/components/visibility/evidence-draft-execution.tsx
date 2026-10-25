"use client";
import { AiPlatformLabel } from "@/components/ui/ai-platform-label";
import { useRef, useState } from 'react';
import Link from 'next/link';

interface Preview { brief: { schemaVersion: number; projectId: string; title: string; execution: { channel: string; mode: string }; aiTargets: Array<{ platform: string; prompt: string }>; actionRevision: { revision: number }; ownFacts: Array<{ id: string; statement: string; scope: string }>; approval: { id: string; expiresAt: string }; publicationAllowed: boolean } }
interface Workflow { id: string; status: string; contentPieceId: string | null; platforms: Array<{ platform: string; status: string; error?: { message: string } }> }
const cls = 'rounded-lg border border-[var(--border)] bg-[var(--bg-base)] p-2 text-sm';
const errorLabels: Record<string, string> = { evidence_brief_disabled: '证据内容功能尚未启用', evidence_authorization_unavailable_or_stale: '证据依据已变化或暂不可用，请重新核对材料', evidence_verification_failed: '证据校验暂不可用，请使用本材料重试', project_scope_required: '需要当前项目权限' };

export function EvidenceDraftExecution({ projectId, approvalId, disabled = false, onManualCreated }: { projectId: string; approvalId: string; disabled?: boolean; onManualCreated?: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null), [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [manualCreated, setManualCreated] = useState(false);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const submit = async (action: 'previewDraft' | 'generateDraft' | 'createManualTask') => {
    if (disabled || busy || !/^[a-f0-9]{32}$/.test(approvalId)) return;
    const payload = { projectId, action, approvalId };
    const signature = JSON.stringify(payload); if (pending.current?.signature !== signature) pending.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setMessage('');
    if (action === 'previewDraft') setPreview(null);
    try {
      const response = await fetch('/api/integration/intelligence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, idempotencyKey: pending.current.key }) });
      const data = await response.json();
      if (!response.ok) { if (response.status < 500) pending.current = null; if (response.status === 409) setPreview(null); const message = typeof data.error === 'string' ? errorLabels[data.error] || (/^[a-z0-9_]+$/i.test(data.error) ? '材料操作未完成，请使用本材料重试' : data.error) : data.error?.message; throw new Error(message || '材料操作未完成，请使用本材料重试'); }
      if (action === 'previewDraft') {
        const value = data.data as Preview;
        if (value?.brief?.schemaVersion !== 3 || value.brief.projectId !== projectId || value.brief.approval?.id !== approvalId || value.brief.publicationAllowed !== false || !Number.isSafeInteger(value.brief.actionRevision?.revision) || !Array.isArray(value.brief.ownFacts) || !value.brief.ownFacts.length || !Array.isArray(value.brief.aiTargets) || !value.brief.aiTargets.length) throw new Error('材料范围不匹配，请重新读取');
        setPreview(value);
      } else if (action === 'generateDraft') {
        if (!data.data?.id) throw new Error('任务受理结果尚待确认，请使用本材料重试');
        setWorkflow(data.data);
      } else { if (!data.data?.id) throw new Error('人工任务受理结果尚待确认，请使用本材料重试'); setManualCreated(true); setMessage('人工内容任务已保存，未消耗生成额度。'); onManualCreated?.(); }
      pending.current = null;
    } catch (error) { setMessage(error instanceof Error ? error.message : '操作结果尚待确认，请使用本材料重试'); }
    finally { setBusy(false); }
  };
  const refreshWorkflow = async () => {
    if (!workflow || busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/content/workflows/${encodeURIComponent(workflow.id)}?${new URLSearchParams({ projectId })}`, { cache: 'no-store' });
      const data = await response.json(); if (!response.ok || data.data?.id !== workflow.id) throw new Error(data.error?.message || '生成状态读取失败'); setWorkflow(data.data);
    } catch (error) { setMessage(error instanceof Error ? error.message : '生成状态读取失败'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3">
    <button disabled={disabled || busy || !/^[a-f0-9]{32}$/.test(approvalId)} onClick={() => submit('previewDraft')} className={`${cls} disabled:opacity-40`}>重新验证并准备材料</button>
    {message && <p role="status" className="text-sm">{message}</p>}
    {preview && <div className="space-y-3 rounded-lg border border-[var(--border)] p-4 text-sm"><h3 className="font-semibold">{preview.brief.title}</h3><p>{preview.brief.execution.mode === 'manual_task' ? '已准备人工内容材料' : '材料已验证，等待明确创建草稿任务'}</p>
      {preview.brief.aiTargets.map((target, index) => <p key={index}><AiPlatformLabel platform={target.platform} iconSize={16} /> · {target.prompt}</p>)}
      <h4 className="font-semibold">行动修订 {preview.brief.actionRevision.revision} 的获批我方事实</h4>{preview.brief.ownFacts.map(fact => <p key={fact.id}>{fact.statement}<span className="block text-[var(--text-secondary)]">仅适用：{fact.scope}</span></p>)}
      <p className="text-[var(--text-secondary)]">材料审批截止：{new Date(preview.brief.approval.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}。草稿与发布分开，成稿仍需审核。</p>
      {preview.brief.execution.mode === 'generate_draft' && <button disabled={disabled || busy || !!workflow} onClick={() => submit('generateDraft')} className={`${cls} disabled:opacity-40`}>创建草稿生成任务（预占1次额度）</button>}
      {preview.brief.execution.mode === 'manual_task' && <button disabled={disabled || busy || manualCreated} onClick={() => submit('createManualTask')} className={`${cls} disabled:opacity-40`}>保存人工内容任务（不扣生成额度）</button>}
    </div>}
    {workflow && <div className="space-y-2 rounded-lg border border-[var(--border)] p-4 text-sm" role="status"><p>草稿任务：{({ queued: '等待生成', generating: '生成处理中', succeeded: '已生成待审核草稿', failed: '生成终止', partial: '部分完成', cancelled: '已取消' } as Record<string, string>)[workflow.status] || workflow.status}</p>
      {workflow.platforms.map(item => <p key={item.platform}>{item.platform} · {item.error?.message || ({ queued: '排队中', generating: '生成中', succeeded: '待审核', failed_retryable: '等待重试', failed_terminal: '生成终止' } as Record<string, string>)[item.status] || item.status}</p>)}
      <button disabled={busy} onClick={refreshWorkflow} className="text-[var(--color-primary)]">刷新任务状态</button>
      <Link href={`/content/workflows/${encodeURIComponent(workflow.id)}?${new URLSearchParams({ projectId })}`} className="block text-[var(--color-primary)]">打开生成进度</Link>
      {workflow.status === 'succeeded' && workflow.contentPieceId && <Link href={`/content/${encodeURIComponent(workflow.contentPieceId)}/edit?${new URLSearchParams({ projectId })}`} className="block text-[var(--color-primary)]">进入草稿审核</Link>}
    </div>}
  </div>;
}
