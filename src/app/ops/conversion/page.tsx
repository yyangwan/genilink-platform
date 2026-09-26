import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OpsAuthorizationError, requireOps } from '@/lib/auth/ops';
import { CONVERSION_EVENTS, getConversionSummary } from '@/lib/marketing/conversion';

const labels: Record<(typeof CONVERSION_EVENTS)[number], string> = {
  diagnosis_intent_created: '诊断意图',
  project_created_from_intent: '创建项目',
  diagnosis_started: '开始诊断',
  diagnosis_completed: '完成诊断',
  lead_submitted: '合作线索',
  checkout_completed: '完成支付',
};

export default async function OpsConversionPage() {
  try { await requireOps(); } catch (error) {
    if (error instanceof OpsAuthorizationError) redirect(error.status === 401 ? '/auth/login?callbackUrl=%2Fops%2Fconversion' : '/dashboard');
    throw error;
  }
  const summary = await getConversionSummary(30);
  return <main className="mx-auto max-w-7xl space-y-8 px-6 py-10">
    <header className="flex items-end justify-between gap-4"><div><p className="text-sm text-[var(--text-muted)]">最近 30 个完整 UTC 日</p><h1 className="text-2xl font-semibold">获客转化</h1></div><Link className="text-sm text-[var(--color-primary)]" href="/ops/leads">查看合作线索</Link></header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CONVERSION_EVENTS.map((event) => <div key={event} className="rounded-xl border border-[var(--border)] p-5"><p className="text-sm text-[var(--text-muted)]">{labels[event]}</p><p className="mt-2 text-3xl font-semibold">{summary.totals[event]}</p></div>)}</section>
    <section className="overflow-x-auto rounded-xl border border-[var(--border)]"><table className="w-full text-left text-sm"><thead className="bg-[var(--bg-elevated)]"><tr><th className="p-3">来源</th><th className="p-3">媒介</th><th className="p-3">活动</th>{CONVERSION_EVENTS.map((event) => <th key={event} className="p-3">{labels[event]}</th>)}</tr></thead><tbody>{summary.channels.map((channel) => <tr key={`${channel.source}:${channel.medium}:${channel.campaign}`} className="border-t border-[var(--border)]"><td className="p-3">{channel.source}</td><td className="p-3">{channel.medium || '—'}</td><td className="p-3">{channel.campaign || '—'}</td>{CONVERSION_EVENTS.map((event) => <td key={event} className="p-3">{channel.events[event]}</td>)}</tr>)}</tbody></table>{summary.channels.length === 0 && <p className="p-6 text-sm text-[var(--text-muted)]">当前时间范围内还没有已汇总的转化数据。</p>}</section>
  </main>;
}
