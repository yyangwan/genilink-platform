import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { quickCheckResult } from '@/lib/mini-program/quick-check-contract';
import { FullDiagnosisForm } from './full-diagnosis-form';

const labels = { access: '首页访问', title: '网页标题', content: '公开正文', structured_data: '结构化数据' };
const statuses = { pass: '已检查', issue: '可改进', unknown: '暂无法判断' };

export default async function QuickCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/quick-checks/${id}`)}`);
  const userId = session.user.id;
  const report = await prisma.websiteQuickCheck.findFirst({ where: { id, ownerUserId: userId, status: 'completed' } });
  if (!report) notFound();
  const parsed = quickCheckResult.safeParse(report.result);
  if (!parsed.success) notFound();
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspace: { select: {
      id: true, name: true,
      projects: { select: { id: true, name: true }, orderBy: { name: 'asc' } },
    } } },
    orderBy: { joinedAt: 'asc' },
  });
  const { priorityFinding, checks, checkedAt, finalHost } = parsed.data;
  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <Link href="/quick-checks" className="text-sm underline">返回官网快检</Link>
      <header>
        <h1 className="text-2xl font-semibold">{new URL(report.targetUrl).hostname}</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          检查于 {new Date(checkedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
          {finalHost && finalHost !== new URL(report.targetUrl).hostname ? ` · 实际页面 ${finalHost}` : ''}
        </p>
      </header>
      {priorityFinding && (
        <article className="dashboard-surface space-y-2 p-5">
          <h2 className="text-lg font-semibold">优先建议 · {priorityFinding.title}</h2>
          {priorityFinding.evidence && <p className="break-words text-[var(--text-secondary)]">{priorityFinding.evidence}</p>}
          <p>{priorityFinding.action}</p>
        </article>
      )}
      <ul className="dashboard-surface divide-y divide-[var(--border)]">
        {checks.map((check) => (
          <li key={check.key} className="space-y-1 p-4">
            <h2 className="font-medium">{labels[check.key]} <span className="ml-2 text-sm text-[var(--text-muted)]">{statuses[check.status]}</span></h2>
            {check.evidence && <p className="break-words text-sm text-[var(--text-secondary)]">{check.evidence}</p>}
          </li>
        ))}
      </ul>
      <FullDiagnosisForm reportId={id} workspaces={memberships.map(({ workspace }) => workspace)} />
    </section>
  );
}
