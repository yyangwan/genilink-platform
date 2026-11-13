import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';

export default async function QuickChecksPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/login?callbackUrl=%2Fquick-checks');
  const reports = await prisma.websiteQuickCheck.findMany({
    where: { ownerUserId: session.user.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, targetUrl: true, createdAt: true },
    take: 50,
  });
  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold">官网快检</h1>
      {reports.length ? (
        <ul className="dashboard-surface divide-y divide-[var(--border)]">
          {reports.map((report) => (
            <li key={report.id}>
              <Link href={`/quick-checks/${report.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:underline">
                <span>{new URL(report.targetUrl).hostname}</span>
                <time dateTime={report.createdAt.toISOString()} className="text-sm text-[var(--text-muted)]">
                  {report.createdAt.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashboard-surface p-5 text-[var(--text-secondary)]">打开智链微信小程序检查官网，并使用当前账号保存结果。</p>
      )}
      {process.env.MINI_PROGRAM_BINDING_ENABLED === 'true' && <Link className="underline" href="/quick-checks/link-wechat">关联微信小程序</Link>}
    </section>
  );
}
