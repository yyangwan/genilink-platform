import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/db';
import {
  decryptWechatResource,
  extractPaymentReference,
  isSuccessfulProviderStatus,
  verifyAlipayNotificationSignature,
  verifyWechatNotificationSignature,
  type PaymentProvider,
} from '@/lib/billing/gateways';
import { activateSubscriptionFromPayment } from '@/lib/billing/reconcile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function resolveOrder(orderId: string | null) {
  if (!orderId) return null;
  return prisma.paymentOrder.findUnique({
    where: { id: orderId },
    include: { billingPlan: true },
  });
}

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
    if (provider === 'wechatpay') {
      const timestamp = req.headers.get('wechatpay-timestamp');
      const nonce = req.headers.get('wechatpay-nonce');
      const signature = req.headers.get('wechatpay-signature');
      if (!timestamp || !nonce || !signature) {
        return NextResponse.json({ error: 'Missing WeChat Pay signature headers' }, { status: 400 });
      }

      const payload = await req.text();
      const signatureVerified = verifyWechatNotificationSignature({
        body: payload,
        timestamp,
        nonce,
        signature,
      });
      if (!signatureVerified) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
      }

      const event = JSON.parse(payload) as {
        id: string;
        event_type: string;
        resource: { ciphertext: string; nonce: string; associated_data?: string };
      };
      const eventRecord = await recordEvent({
        provider: 'wechatpay',
        providerEventId: event.id,
        eventType: event.event_type,
        payload: event as Prisma.InputJsonValue,
        signatureVerified,
      });

      if (eventRecord.processedAt) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      const resource = decryptWechatResource(event.resource);
      const reference = extractPaymentReference('wechatpay', resource);
      const success = isSuccessfulProviderStatus('wechatpay', reference.status);

      let handledOrderId: string | null = null;
      if (success && reference.orderId) {
        const result = await activateSubscriptionFromPayment({
          orderId: reference.orderId,
          provider: 'wechatpay',
          providerSessionId: reference.providerTransactionId ?? reference.orderId,
          providerSubscriptionId: reference.providerTransactionId ?? reference.orderId,
          providerStatus: 'active',
          paidAt: reference.paidAt,
        });
        handledOrderId = result?.order.id ?? reference.orderId;
      }

      await prisma.paymentEvent.update({
        where: { providerEventId: event.id },
        data: {
          status: handledOrderId ? 'processed' : 'ignored',
          paymentOrderId: handledOrderId,
          processedAt: new Date(),
        },
      });

      return NextResponse.json({ code: 'SUCCESS', message: '成功' });
    }

    const form = await req.formData();
    const payload: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      payload[key] = String(value);
    }

    const signatureVerified = verifyAlipayNotificationSignature(payload);
    if (!signatureVerified) {
      return NextResponse.json('fail', { status: 400 });
    }

    const providerEventId = payload.notify_id ?? payload.trade_no ?? payload.out_trade_no ?? crypto.randomUUID();
    const eventRecord = await recordEvent({
      provider: 'alipay',
      providerEventId,
      eventType: payload.trade_status ?? 'unknown',
      payload: payload as Prisma.InputJsonValue,
      signatureVerified,
    });

    if (eventRecord.processedAt) {
      return new NextResponse('success');
    }

    const reference = extractPaymentReference('alipay', payload);
    const success = isSuccessfulProviderStatus('alipay', reference.status);

    let handledOrderId: string | null = null;
    if (success && reference.orderId) {
      const result = await activateSubscriptionFromPayment({
        orderId: reference.orderId,
        provider: 'alipay',
        providerSessionId: reference.providerTransactionId ?? reference.orderId,
        providerSubscriptionId: reference.providerTransactionId ?? reference.orderId,
        providerStatus: 'active',
        paidAt: reference.paidAt,
      });
      handledOrderId = result?.order.id ?? reference.orderId;
    }

    await prisma.paymentEvent.update({
      where: { providerEventId },
      data: {
        status: handledOrderId ? 'processed' : 'ignored',
        paymentOrderId: handledOrderId,
        processedAt: new Date(),
      },
    });

    return new NextResponse('success');
  } catch (error) {
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
