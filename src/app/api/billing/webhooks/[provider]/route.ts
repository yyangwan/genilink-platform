import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { isSuccessfulProviderStatus } from '@/lib/billing/gateways';
import { getAdapter } from '@/lib/billing/payments/provider';
import type { PaymentProvider } from '@/lib/billing/gateways';
import type { VerifiedProviderEvent } from '@/lib/billing/payments/provider';
import { reconcileCheckoutPayment } from '@/lib/billing/reconcile';
import { billingLog, billingMetric } from '@/lib/billing/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function providerSuccessResponse(provider: PaymentProvider, extra: Record<string, unknown> = {}) {
  return provider === 'wechatpay'
    ? NextResponse.json({ code: 'SUCCESS', message: '成功', ...extra })
    : new NextResponse('success');
}

/**
 * Strict channel-identity check (remediation §4.9): fail CLOSED. A missing
 * expected env value or a missing/mismatching payload field both reject.
 * Returns a rejection reason, or null when the identity is confirmed.
 */
function verifyProviderIdentity(
  provider: PaymentProvider,
  parsed: VerifiedProviderEvent,
): string | null {
  if (provider === 'wechatpay') {
    const expectedMchId = process.env.WECHATPAY_MCH_ID?.trim();
    const expectedAppId = process.env.WECHATPAY_APP_ID?.trim();
    if (!expectedMchId) return 'missing_expected_mchid';
    if (!expectedAppId) return 'missing_expected_appid';
    if (!parsed.mchId) return 'missing_mchid';
    if (!parsed.appId) return 'missing_appid';
    if (parsed.mchId !== expectedMchId) return 'mchid_mismatch';
    if (parsed.appId !== expectedAppId) return 'appid_mismatch';
    return null;
  }
  const expectedAppId = process.env.ALIPAY_APP_ID?.trim();
  const expectedSellerId = process.env.ALIPAY_SELLER_ID?.trim();
  if (!expectedAppId) return 'missing_expected_appid';
  if (!parsed.appId) return 'missing_app_id';
  if (parsed.appId !== expectedAppId) return 'app_id_mismatch';
  if (expectedSellerId) {
    // parsed.mchId carries the alipay seller_id (adapter maps it).
    if (!parsed.mchId) return 'missing_seller_id';
    if (parsed.mchId !== expectedSellerId) return 'seller_id_mismatch';
  }
  return null;
}

/**
 * Financial completeness for success events (remediation §4.9): amount and
 * currency are REQUIRED — a success event without them must never activate
 * a subscription. v1 only settles CNY.
 */
function validateSuccessEvent(parsed: VerifiedProviderEvent): string | null {
  if (!parsed.providerOrderId) return 'missing_order_id';
  if (parsed.amountCents === null || !Number.isFinite(parsed.amountCents) || parsed.amountCents <= 0) {
    return 'missing_amount';
  }
  if (parsed.currency !== 'CNY') return 'unsupported_currency';
  return null;
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

/** Persist a permanent rejection so the channel stops retrying but the audit
 * trail keeps the payload and reason (remediation §4.9.5/6). */
async function rejectEvent(params: {
  provider: PaymentProvider;
  providerEventId: string;
  eventType: string;
  payload: Prisma.InputJsonValue;
  reason: string;
  paymentOrderId?: string | null;
}) {
  const existing = await prisma.paymentEvent.findUnique({
    where: { providerEventId: params.providerEventId },
    select: { id: true },
  });
  if (existing) {
    await prisma.paymentEvent.update({
      where: { providerEventId: params.providerEventId },
      data: {
        status: 'rejected',
        processedAt: new Date(),
        paymentOrderId: params.paymentOrderId ?? null,
      },
    });
  } else {
    await prisma.paymentEvent.create({
      data: {
        provider: params.provider,
        providerEventId: params.providerEventId,
        eventType: params.eventType,
        status: 'rejected',
        signatureVerified: true,
        payload: params.payload,
        processedAt: new Date(),
        paymentOrderId: params.paymentOrderId ?? null,
      },
    });
  }
  billingMetric('billing_webhook_invalid_total', {
    provider: params.provider,
    reason: params.reason,
  });
  billingLog('webhook_event_rejected', {
    provider: params.provider,
    providerEventId: params.providerEventId,
    reason: params.reason,
    paymentOrderId: params.paymentOrderId ?? null,
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
      // Permanent payload-level failure — 400 stops channel retries while the
      // metric keeps a signal (remediation §4.9.6).
      billingMetric('billing_webhook_invalid_total', { provider, reason: parsed.error });
      return provider === 'wechatpay'
        ? NextResponse.json({ code: 'FAIL', message: parsed.message }, { status: 400 })
        : new NextResponse('fail', { status: 400 });
    }

    const payload = (provider === 'wechatpay' ? JSON.parse(rawBody) : (form ?? {})) as Prisma.InputJsonValue;

    // ─── Strict identity check BEFORE touching business data (remediation §4.9).
    const identityReason = verifyProviderIdentity(provider, parsed);
    if (identityReason) {
      await rejectEvent({
        provider,
        providerEventId: parsed.providerEventId,
        eventType: parsed.eventType,
        payload,
        reason: identityReason,
      });
      return providerSuccessResponse(provider);
    }

    const success = isSuccessfulProviderStatus(provider, parsed.status);

    // ─── Financial completeness for success events (remediation §4.9).
    if (success) {
      const financialReason = validateSuccessEvent(parsed);
      if (financialReason) {
        await rejectEvent({
          provider,
          providerEventId: parsed.providerEventId,
          eventType: parsed.eventType,
          payload,
          reason: financialReason,
        });
        // Ack permanently: retrying the same payload cannot fix it.
        return providerSuccessResponse(provider);
      }
    }

    const event = await recordEvent({
      provider,
      providerEventId: parsed.providerEventId,
      eventType: parsed.eventType,
      payload,
      signatureVerified: true,
    });

    // Duplicate notification: ACK without re-activating (spec §11.1).
    if (event.processedAt) {
      return providerSuccessResponse(provider, { duplicate: true });
    }

    let handledOrderId: string | null = null;
    if (success && parsed.providerOrderId) {
      const order = await prisma.paymentOrder.findUnique({
        where: { id: parsed.providerOrderId },
        select: { id: true, checkoutSessionId: true, orderType: true, renewalAttempt: { select: { id: true } } },
      });

      if (order && (order.orderType === 'renewal' || order.renewalAttempt)) {
        // Renewal orders flow through the unified reconciliation entry, which
        // dispatches to reconcileRenewalPayment (remediation §4.3).
        await reconcileCheckoutPayment({
          paymentEventId: parsed.providerEventId,
          paymentOrderId: order.id,
          provider,
          providerTransactionId: parsed.providerTransactionId,
          amountCents: parsed.amountCents,
          paidAt: parsed.paidAt,
        });
        handledOrderId = order.id;
      } else if (order?.checkoutSessionId) {
        // Initial purchase / upgrade / manual renewal under a checkout session.
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
        // Order exists but has NO link to either new domain model. No legacy
        // path is permitted to silently activate a subscription — flag for
        // manual review instead (remediation §4.3.4).
        billingLog('webhook_order_requires_review', {
          provider,
          paymentOrderId: order.id,
          orderType: order.orderType,
          providerTransactionId: parsed.providerTransactionId,
          eventType: parsed.eventType,
        });
        await prisma.paymentEvent.update({
          where: { providerEventId: parsed.providerEventId },
          data: { status: 'requires_review', processedAt: new Date(), paymentOrderId: order.id },
        });
        billingMetric('billing_webhook_invalid_total', {
          provider,
          reason: 'order_without_domain_link',
        });
        return providerSuccessResponse(provider);
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

    return providerSuccessResponse(provider);
  } catch (error) {
    billingLog('webhook_processing_failed', {
      provider,
      errorCode: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
