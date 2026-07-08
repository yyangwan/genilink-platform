import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { prisma } from '@/lib/db';
import { syncBillingPlans } from '@/lib/billing/service';
import {
  buildCheckoutUrls,
  createAlipayCheckoutUrl,
  createWechatNativeCheckout,
  getAppBaseUrl,
  isPaymentProviderConfigured,
  type PaymentProvider,
} from '@/lib/billing/gateways';

export const dynamic = 'force-dynamic';

const checkoutSchema = z.object({
  planKey: z.string().min(1),
  provider: z.enum(['wechatpay', 'alipay']).optional(),
});

function resolveProvider(planProvider: string, requestedProvider?: PaymentProvider): PaymentProvider {
  if (requestedProvider) {
    return requestedProvider;
  }

  if (planProvider === 'wechatpay' || planProvider === 'alipay') {
    return planProvider;
  }

  return 'wechatpay';
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  let body: z.infer<typeof checkoutSchema>;
  try {
    body = checkoutSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  await syncBillingPlans();

  const plan = await prisma.billingPlan.findUnique({
    where: { key: body.planKey },
  });

  if (!plan || !plan.isActive) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  if (plan.priceCents <= 0) {
    return NextResponse.json(
      { error: 'Billing plan is not configured yet', code: 'PLAN_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const provider = resolveProvider(plan.provider, body.provider);
  if (!isPaymentProviderConfigured(provider)) {
    return NextResponse.json(
      { error: 'Payment provider is not configured yet', code: 'PAYMENT_PROVIDER_NOT_CONFIGURED', provider },
      { status: 503 },
    );
  }

  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      userId: session.user.id,
      workspaceId,
      module: plan.module,
      status: {
        in: ['active', 'trialing'],
      },
      currentPeriodEnd: {
        gt: new Date(),
      },
    },
    orderBy: { currentPeriodEnd: 'desc' },
    select: {
      id: true,
      module: true,
      billingCycle: true,
      currentPeriodEnd: true,
    },
  });

  if (activeSubscription) {
    return NextResponse.json(
      {
        error: 'Active subscription already exists for this module',
        code: 'ACTIVE_SUBSCRIPTION_EXISTS',
        subscription: {
          ...activeSubscription,
          currentPeriodEnd: activeSubscription.currentPeriodEnd.toISOString(),
        },
      },
      { status: 409 },
    );
  }

  const order = await prisma.paymentOrder.create({
    data: {
      userId: session.user.id,
      workspaceId,
      billingPlanId: plan.id,
      module: plan.module,
      billingCycle: plan.billingCycle,
      provider,
      status: 'pending',
      amountCents: plan.priceCents,
      currency: plan.currency,
      metadata: {
        planKey: plan.key,
        module: plan.module,
        billingCycle: plan.billingCycle,
        workspaceId,
        userId: session.user.id,
        provider,
      },
    },
  });

  const baseUrl = getAppBaseUrl(req.headers.get('origin') ?? undefined);
  const { successUrl, cancelUrl } = buildCheckoutUrls(baseUrl, order.id);
  void cancelUrl;

  const checkoutResult = provider === 'wechatpay'
    ? await createWechatNativeCheckout({
      order,
      plan: {
        ...plan,
        provider: provider,
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      },
      requestOrigin: req.headers.get('origin') ?? undefined,
    })
    : await createAlipayCheckoutUrl({
        order,
        plan: {
          ...plan,
          provider: provider,
          createdAt: plan.createdAt.toISOString(),
          updatedAt: plan.updatedAt.toISOString(),
        },
        requestOrigin: req.headers.get('origin') ?? undefined,
      });

  const updatedOrder = await prisma.paymentOrder.update({
    where: { id: order.id },
    data: {
      providerSessionId: checkoutResult.providerSessionId,
      checkoutUrl: checkoutResult.checkoutUrl,
      successUrl,
      cancelUrl,
      status: 'opened',
      metadata: {
        planKey: plan.key,
        module: plan.module,
        billingCycle: plan.billingCycle,
        workspaceId,
        userId: session.user.id,
        provider,
        checkoutSessionId: checkoutResult.providerSessionId,
        providerPayload: checkoutResult.providerPayload,
      },
    },
  });

  return NextResponse.json({
    order: {
      id: updatedOrder.id,
      status: updatedOrder.status,
      checkoutUrl: updatedOrder.checkoutUrl,
      providerSessionId: updatedOrder.providerSessionId,
      provider: updatedOrder.provider,
    },
    checkoutUrl: updatedOrder.checkoutUrl,
    provider: updatedOrder.provider,
  });
}
