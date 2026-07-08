import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ orderId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const { orderId } = await ctx.params;
  const order = await prisma.paymentOrder.findFirst({
    where: {
      id: orderId,
      userId: session.user.id,
      workspaceId,
    },
    include: {
      billingPlan: true,
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      provider: order.provider,
      checkoutUrl: order.checkoutUrl,
      successUrl: order.successUrl,
      cancelUrl: order.cancelUrl,
      amountCents: order.amountCents,
      currency: order.currency,
      metadata: order.metadata,
      paidAt: order.paidAt?.toISOString() ?? null,
      expiredAt: order.expiredAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    },
    billingPlan: order.billingPlan
      ? {
          id: order.billingPlan.id,
          key: order.billingPlan.key,
          name: order.billingPlan.name,
          provider: order.billingPlan.provider,
        }
      : null,
  });
}
