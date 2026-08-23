import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { prisma } from '@/lib/db';
import { expireStaleSessions, getCheckoutSessionView } from '@/lib/billing/checkout/service';
import { CheckoutPage } from '@/components/billing/checkout/checkout-page';

export const dynamic = 'force-dynamic';

export default async function CheckoutSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(`/checkout/${sessionId}`)}`);
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    redirect('/auth/login?callbackUrl=' + encodeURIComponent(`/checkout/${sessionId}`));
  }

  // Report stale sessions as expired even without the cron sweep.
  await expireStaleSessions().catch(() => undefined);

  const view = await getCheckoutSessionView({
    sessionId,
    userId: session.user.id,
    workspaceId,
  });

  if (!view) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="dashboard-surface max-w-md p-8 text-center">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>结算会话不存在</h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            该结算会话已失效或无权访问，请返回套餐页重新发起。
          </p>
          <a
            href="/settings/billing"
            className="mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--color-primary)', color: '#0b0d14' }}
          >
            返回套餐页
          </a>
        </div>
      </main>
    );
  }

  const workspace = workspaceId
    ? await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })
    : null;

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <CheckoutPage initialSession={view} workspaceName={workspace?.name ?? null} />
    </main>
  );
}
