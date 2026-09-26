import { notFound, redirect } from 'next/navigation';
import { OpsAuthorizationError, requireOps } from '@/lib/auth/ops';
import { prisma } from '@/lib/db';
import { decryptContact } from '@/lib/marketing/contact-crypto';
import { LeadActions } from './lead-actions';

export default async function OpsLeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  try { await requireOps(); } catch (error) {
    if (error instanceof OpsAuthorizationError) redirect(error.status === 401 ? '/auth/login' : '/dashboard');
    throw error;
  }
  const { id } = await params;
  const lead = await prisma.marketingLead.findUnique({ where: { id }, include: {
    statusEvents: { orderBy: { createdAt: 'desc' } },
    privacyEvents: { orderBy: { createdAt: 'desc' } },
  } });
  if (!lead) notFound();
  const contact = lead.contactCiphertext ? decryptContact(lead.contactCiphertext) : null;
  return <main className="mx-auto max-w-3xl space-y-6 px-6 py-10"><div><p className="text-sm text-[var(--text-muted)]">{lead.kind} · {lead.grade} · {lead.score} 分</p><h1 className="text-2xl font-semibold">{lead.companyName}</h1></div><section className="rounded-xl border border-[var(--border)] p-5"><h2 className="mb-3 font-semibold">联系方式</h2>{contact ? <><p>手机：{contact.phone || '未提供'}</p><p>邮箱：{contact.email || '未提供'}</p><p>微信：{contact.wechat || '未提供'}</p></> : <p className="text-sm text-[var(--text-muted)]">提交人已撤回联系授权，联系方式已删除。</p>}</section><section className="rounded-xl border border-[var(--border)] p-5"><LeadActions id={lead.id} version={lead.version} status={lead.status} /></section><section className="rounded-xl border border-[var(--border)] p-5"><h2 className="mb-3 font-semibold">需求</h2><p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)]">{lead.requirements || '未填写'}</p></section><section className="rounded-xl border border-[var(--border)] p-5"><h2 className="mb-3 font-semibold">状态记录</h2><ol className="space-y-3 text-sm">{lead.statusEvents.map((event) => <li key={event.id} className="border-l-2 border-[var(--border)] pl-3"><p>{event.fromStatus ? `${event.fromStatus} → ` : ''}{event.toStatus}</p><p className="text-[var(--text-muted)]">{event.createdAt.toLocaleString('zh-CN')}{event.note ? ` · ${event.note}` : ''}</p></li>)}</ol></section>{lead.privacyEvents.length ? <section className="rounded-xl border border-[var(--border)] p-5"><h2 className="mb-3 font-semibold">隐私操作记录</h2><ol className="space-y-3 text-sm">{lead.privacyEvents.map((event) => <li key={event.id}><p>{event.action === 'contact_consent_withdrawn' ? '已撤回联系授权并删除联系方式' : event.action}</p><p className="text-[var(--text-muted)]">{event.createdAt.toLocaleString('zh-CN')}</p></li>)}</ol></section> : null}</main>;
}
