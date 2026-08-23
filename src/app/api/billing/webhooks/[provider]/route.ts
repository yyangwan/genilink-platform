import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { isSuccessfulProviderStatus } from '@/lib/billing/gateways';
import { getAdapter } from '@/lib/billing/payments/provider';
import type { PaymentProvider } from '@/lib/billing/gateways';
import { activateSubscriptionFromPayment, reconcileCheckoutPayment } from '@/lib/billing/reconcile';
import { billingLog, billingMetric } from '@/lib/billing/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function recordEvent(params: {
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  signatureVerified: boolean;
}) {
  return prisma.paymentEvent.upsert({
    where: { providerEventId: params.providerEventId },
    create: {
      provider: params.provider,
      providerEventId: params.providerEventId,
      eventType: params.eventType,
      status: 'received',
      signatureVerified: params.signatureVerified,
      payload: params.payload,
    },
    update: {
      eventType: params.eventType,
      status: 'received',
      signatureVerified: params.signatureVerified,
      payload: params.payload,
    },
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (provider !== 'wechatpay' && provider !== 'alipay') {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 404 });
  }

  try {
    // ─── Parse + verify via the channel adapter (verify BEFORE reading data).
    let rawBody = '';
    let form: Record<string, string> | undefined;
    if (provider === 'wechatpay') {
      rawBody = await req.text();
    } else {
      const formData = await req.formData();
      form = {};
      for (const [key, value] of formData.entries()) {
        form[key] = String(value);
      }
      rawBody = JSON.stringify(form);
    }

    const adapter = getAdapter(provider);
    const parsed = await adapter.verifyWebhook({
      rawBody,
      headers: {
        'wechatpay-timestamp': req.headers.get('wechatpay-timestamp'),
        'wechatpay-nonce': req.headers.get('wechatpay-nonce'),
        'wechatpay-signature': req.headers.get('wechatpay-signature'),
      },
      form,
    });

    if ('error' in parsed) {
      return provider === 'wechatpay'
        ? NextResponse.json({ code: 'FAIL', message: parsed.message }, { status: 400 })
        : new NextResponse('fail', { status: 400 });
    }

    // Verify merchant/app identity before touching business data (spec §11.1).
    const expectedMchId = process.env.WECHATPAY_MCH_ID?.trim();
    const expectedAppId = process.env.ALIPAY_APP_ID?.trim();
    if (
      (provider === 'wechatpay' && parsed.mchId && expectedMchId && parsed.mchId !== expectedMchId) ||
      (provider === 'alipay' && parsed.appId && expectedAppId && parsed.appId !== expectedAppId)
    ) {
      billingMetric('billing_webhook_invalid_total', { provider, reason: 'identity_mismatch' });
      return provider === 'wechatpay'
        ? NextResponse.json({ code: 'FAIL', message: 'merchant mismatch' }, { status: 400 })
        : new NextResponse('fail', { status: 400 });
    }

    const event = await recordEvent({
      provider,
      providerEventId: parsed.providerEventId,
      eventType: parsed.eventType,
      payload: (provider === 'wechatpay' ? JSON.parse(rawBody) : (form ?? {})) as Prisma.InputJsonValue,
      signatureVerified: true,
    });

    // Duplicate notification: ACK without re-activating (spec §11.1).
    if (event.processedAt) {
      return provider === 'wechatpay'
        ? NextResponse.json({ code: 'SUCCESS', message: '成功', duplicate: true })
        : new NextResponse('success');
    }

    const success = isSuccessfulProviderStatus(provider, parsed.status);

    let handledOrderId: string | null = null;
    if (success && parsed.providerOrderId) {
      const order = await prisma.paymentOrder.findUnique({
        where: { id: parsed.providerOrderId },
        select: { id: true, checkoutSessionId: true, orderType: true },
      });

      if (order?.checkoutSessionId) {
        // New path: transactional reconciliation with amount + session guards.
        await reconcileCheckoutPayment({
          paymentEventId: parsed.providerEventId,
          paymentOrderId: order.id,
          provider,
          providerTransactionId: parsed.providerTransactionId,
          amountCents: parsed.amountCents,
          paidAt: parsed.paidAt,
        });
        handledOrderId = order.id;
      } else if (order) {
        // Legacy path: orders created before checkout sessions existed.
        const result = await activateSubscriptionFromPayment({
          orderId: order.id,
          provider,
          providerSessionId: parsed.providerTransactionId ?? order.id,
          providerSubscriptionId: parsed.providerTransactionId ?? order.id,
          providerStatus: 'active',
          paidAt: parsed.paidAt,
        });
        handledOrderId = result?.order.id ?? order.id;
      } else {
        billingLog('webhook_order_not_found', {
          provider,
          providerTransactionId: parsed.providerTransactionId,
          eventType: parsed.eventType,
        });
      }
    }

    if (!event.processedAt) {
      await prisma.paymentEvent.update({
        where: { providerEventId: parsed.providerEventId },
        data: {
          status: handledOrderId ? 'processed' : 'ignored',
          paymentOrderId: handledOrderId,
          processedAt: new Date(),
        },
      });
    }

    if (success && handledOrderId) {
      billingMetric('billing_payment_success_total', { provider });
    }

    return provider === 'wechatpay'
      ? NextResponse.json({ code: 'SUCCESS', message: '成功' })
      : new NextResponse('success');
  } catch (error) {
    billingLog('webhook_processing_failed', {
      provider,
      errorCode: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
