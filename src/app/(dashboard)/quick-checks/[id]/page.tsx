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
  const hostname = new URL(report.targetUrl).hostname;
  return (
    <section className="quick-checks__page">
      <header className="quick-checks__header">
        <Link href="/quick-checks" className="quick-checks__link quick-checks__back">← 返回官网快检</Link>
        <h1>{hostname}</h1>
        <p className="quick-checks__muted">
          检查于 {new Date(checkedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
          {finalHost && finalHost !== hostname ? ` · 实际页面 ${finalHost}` : ''}
        </p>
      </header>
      {priorityFinding && (
        <article className="quick-checks__panel quick-checks__priority">
          <h2 className="quick-checks__panel-title">优先建议 · {priorityFinding.title}</h2>
          <div className="quick-checks__body">
            {priorityFinding.evidence && <p className="quick-checks__muted">{priorityFinding.evidence}</p>}
            <p>{priorityFinding.action}</p>
          </div>
        </article>
      )}
      <section className="quick-checks__panel" aria-labelledby="check-findings">
        <h2 className="quick-checks__panel-title" id="check-findings">检查明细</h2>
        <ul className="quick-checks__list">
          {checks.map((check) => (
            <li key={check.key} className="quick-checks__item">
              <div className="quick-checks__item-head">
                <h3>{labels[check.key]}</h3>
                <span className={`quick-checks__badge quick-checks__badge--${check.status}`}>{statuses[check.status]}</span>
              </div>
              {check.evidence && <p className="quick-checks__muted">{check.evidence}</p>}
            </li>
          ))}
        </ul>
      </section>
      <FullDiagnosisForm reportId={id} workspaces={memberships.map(({ workspace }) => workspace)} />
    </section>
  );
}
