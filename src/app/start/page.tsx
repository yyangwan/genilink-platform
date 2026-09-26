import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { StartClient } from './start-client';

export default async function AcquisitionStartPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/login?callbackUrl=%2Fstart');

  const cookieStore = await cookies();
  const intentId = cookieStore.get('genilink-intent')?.value;
  const intent = intentId
    ? await prisma.acquisitionIntent.findUnique({ where: { id: intentId } })
    : null;

  if (!intent || !intent.targetUrl || intent.expiresAt <= new Date() || (intent.userId && intent.userId !== session.user.id)) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 py-16">
        <section className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-8">
          <h1 className="mb-3 text-2xl font-semibold">诊断链接已失效</h1>
          <p className="mb-6 text-[var(--text-secondary)]">请返回首页重新输入官网地址。</p>
          <Link href="/" className="text-[var(--color-primary)]">返回首页</Link>
        </section>
      </main>
    );
  }

  return <StartClient targetUrl={intent.targetUrl} />;
}
