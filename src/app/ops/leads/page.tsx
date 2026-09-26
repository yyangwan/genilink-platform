import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OpsAuthorizationError, requireOps } from '@/lib/auth/ops';
import { prisma } from '@/lib/db';

export default async function OpsLeadsPage() {
  try { await requireOps(); } catch (error) {
    if (error instanceof OpsAuthorizationError) redirect(error.status === 401 ? '/auth/login?callbackUrl=%2Fops%2Fleads' : '/dashboard');
    throw error;
  }
  const leads = await prisma.marketingLead.findMany({ orderBy: [{ score: 'desc' }, { createdAt: 'desc' }], take: 100 });
  return <main className="mx-auto max-w-6xl px-6 py-10"><header className="mb-6 flex items-end justify-between gap-4"><h1 className="text-2xl font-semibold">合作线索</h1><Link className="text-sm text-[var(--color-primary)]" href="/ops/conversion">查看获客转化</Link></header><div className="overflow-x-auto rounded-xl border border-[var(--border)]"><table className="w-full text-left text-sm"><thead className="bg-[var(--bg-elevated)]"><tr><th className="p-3">公司</th><th className="p-3">类型</th><th className="p-3">等级</th><th className="p-3">状态</th><th className="p-3">提交时间</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-[var(--border)]"><td className="p-3"><Link className="text-[var(--color-primary)]" href={`/ops/leads/${lead.id}`}>{lead.companyName}</Link></td><td className="p-3">{lead.kind}</td><td className="p-3">{lead.grade} · {lead.score}</td><td className="p-3">{lead.status}</td><td className="p-3">{lead.createdAt.toLocaleString('zh-CN')}</td></tr>)}</tbody></table></div></main>;
}
