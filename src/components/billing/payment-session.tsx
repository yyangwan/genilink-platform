"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import type { PaymentProvider } from '@/lib/billing/gateways';

type OrderResponse = {
  order: {
    id: string;
    status: string;
    provider: PaymentProvider;
    checkoutUrl: string | null;
    metadata: Record<string, unknown> | null;
  };
  billingPlan: {
    id: string;
    key: string;
    name: string;
    provider: PaymentProvider;
  } | null;
};

interface PaymentSessionProps {
  orderId: string;
}

export default function PaymentSession({ orderId }: PaymentSessionProps) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderResponse['order'] | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadOrder() {
      try {
        const res = await fetch(`/api/billing/orders/${orderId}`, { signal: controller.signal });
        const data = (await res.json()) as OrderResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load order');
        }
        if (!active) return;
        setOrder(data.order);
        setError(null);

        const providerPayload = data.order.metadata?.providerPayload as { codeUrl?: string } | undefined;
        const codeUrl = typeof providerPayload?.codeUrl === 'string' ? providerPayload.codeUrl : null;
        if (data.order.provider === 'wechatpay' && codeUrl) {
          const qr = await QRCode.toDataURL(codeUrl, { margin: 1, width: 280 });
          if (active) {
            setQrDataUrl(qr);
          }
        }
      } catch (err) {
        if (active && (err as Error).name !== 'AbortError') {
          setError('无法加载支付订单');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadOrder();

    return () => {
      active = false;
      controller.abort();
    };
  }, [orderId]);

  useEffect(() => {
    if (!order || order.status === 'paid' || order.status === 'active') {
      return;
    }

    const timer = setInterval(async () => {
      setPolling(true);
      try {
        const res = await fetch(`/api/billing/orders/${orderId}`);
        const data = (await res.json()) as OrderResponse & { error?: string };
        if (!res.ok) {
          throw new Error(data.error || 'Failed to poll order');
        }

        setOrder(data.order);
        if (data.order.status === 'paid' || data.order.status === 'active') {
          await fetch('/api/billing/access', { method: 'POST' }).catch(() => {});
          router.replace(`/settings/billing?checkout=success&orderId=${orderId}`);
        }
      } catch {
        // Keep polling.
      } finally {
        setPolling(false);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [order, orderId, router]);

  const paymentLabel = useMemo(() => {
    if (!order) {
      return '支付准备中';
    }
    return order.provider === 'wechatpay' ? '微信支付' : '支付宝';
  }, [order]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center rounded-2xl border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Loader2 className="h-4 w-4 animate-spin" />
          正在加载支付信息
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border p-6" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>{error}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl rounded-2xl border p-6" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {paymentLabel}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            订单号 {order?.id}
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
          {polling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          自动检测中
        </div>
      </div>

      {order?.provider === 'wechatpay' ? (
        <div className="grid gap-4">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
            {qrDataUrl ? (
              <img alt="WeChat Pay QR code" className="mx-auto h-72 w-72" src={qrDataUrl} />
            ) : (
              <div className="flex h-72 items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
                QR 码生成中
              </div>
            )}
          </div>
          <div className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
            打开微信扫一扫完成支付。支付成功后页面会自动返回。
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              正在跳转到支付宝收银台。如果没有自动跳转，请返回上一页重新发起。
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: 'var(--color-primary)', color: '#0b0d14' }}
              onClick={() => {
                if (order?.checkoutUrl) {
                  window.location.assign(order.checkoutUrl);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              继续支付
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
