import Link from 'next/link';
import { ChevronRight, Link2 } from 'lucide-react';
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
    <section className="quick-checks__page">
      <header className="quick-checks__header quick-checks__header--actions">
        <div>
          <h1>官网快检</h1>
          <p className="quick-checks__muted">查看从微信小程序保存的官网报告。</p>
        </div>
        {process.env.MINI_PROGRAM_BINDING_ENABLED === 'true' && (
          <Link className="dashboard-button dashboard-button--secondary" href="/quick-checks/link-wechat">
            <Link2 size={16} aria-hidden="true" />关联微信小程序
          </Link>
        )}
      </header>
      <section className="quick-checks__panel" aria-labelledby="saved-reports">
        <h2 className="quick-checks__panel-title" id="saved-reports">已保存的报告</h2>
        {reports.length ? (
          <ul className="quick-checks__list">
            {reports.map((report) => (
              <li key={report.id}>
                <Link href={`/quick-checks/${report.id}`} className="quick-checks__report-link">
                  <span className="quick-checks__link">{new URL(report.targetUrl).hostname}</span>
                  <span className="quick-checks__report-meta quick-checks__muted">
                    <time dateTime={report.createdAt.toISOString()}>
                      {report.createdAt.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                    </time>
                    <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="quick-checks__body">
            <p className="quick-checks__muted">暂无报告。打开智链微信小程序检查官网，并使用当前账号保存结果。</p>
          </div>
        )}
      </section>
    </section>
  );
}
