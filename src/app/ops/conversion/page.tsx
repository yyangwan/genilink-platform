import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { OpsAuthorizationError, requireOps } from '@/lib/auth/ops';
import { CONVERSION_EVENTS, getConversionSummary, getMiniProgramConversion } from '@/lib/marketing/conversion';

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
    if (error instanceof OpsAuthorizationError) {
      if (error.status === 401) redirect('/auth/login?callbackUrl=%2Fops%2Fconversion');
      notFound();
    }
    throw error;
  }
  const [summary, mini] = await Promise.all([getConversionSummary(30), getMiniProgramConversion()]);
  return <div className="mx-auto max-w-7xl space-y-8 px-6 py-10">
    <header className="flex items-end justify-between gap-4"><div><p className="text-sm text-[var(--text-muted)]">最近 30 个完整 UTC 日</p><h1 className="text-2xl font-semibold">获客转化</h1></div><Link className="text-sm text-[var(--color-primary)]" href="/ops/leads">查看合作线索</Link></header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CONVERSION_EVENTS.map((event) => <div key={event} className="rounded-xl border border-[var(--border)] p-5"><p className="text-sm text-[var(--text-muted)]">{labels[event]}</p><p className="mt-2 text-3xl font-semibold">{summary.totals[event]}</p></div>)}</section>
    <section className="overflow-x-auto rounded-xl border border-[var(--border)]"><table className="w-full text-left text-sm"><thead className="bg-[var(--bg-elevated)]"><tr><th className="p-3">来源</th><th className="p-3">媒介</th><th className="p-3">活动</th>{CONVERSION_EVENTS.map((event) => <th key={event} className="p-3">{labels[event]}</th>)}</tr></thead><tbody>{summary.channels.map((channel) => <tr key={`${channel.source}:${channel.medium}:${channel.campaign}`} className="border-t border-[var(--border)]"><td className="p-3">{channel.source}</td><td className="p-3">{channel.medium || '—'}</td><td className="p-3">{channel.campaign || '—'}</td>{CONVERSION_EVENTS.map((event) => <td key={event} className="p-3">{channel.events[event]}</td>)}</tr>)}</tbody></table>{summary.channels.length === 0 && <p className="p-6 text-sm text-[var(--text-muted)]">当前时间范围内还没有已汇总的转化数据。</p>}</section>
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">微信小程序</h2>
      <p className="text-sm text-[var(--text-muted)]">按首次查看报告后的 7 天统计，每份报告只计一次。</p>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-left text-sm">
          <thead><tr>{['渠道', '查看报告', '新注册', '老账号绑定', '保存报告', '继续使用', '继续使用率'].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{mini.map((row) => <tr key={row.channel} className="border-t border-[var(--border)]">
            <td className="p-3">{row.channel}</td>
            <td className="p-3">{row.viewed}</td>
            <td className="p-3">{row.registered}</td>
            <td className="p-3">{row.linked}</td>
            <td className="p-3">{row.saved}</td>
            <td className="p-3">{row.continued}</td>
            <td className="p-3">{(row.continued / row.viewed * 100).toFixed(1)}%</td>
          </tr>)}</tbody>
        </table>
        {mini.length === 0 && <p className="p-4 text-sm text-[var(--text-muted)]">暂无已完成观察窗口的报告。</p>}
      </div>
    </section>
  </div>;
}
