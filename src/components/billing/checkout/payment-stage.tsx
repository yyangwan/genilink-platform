'use client';

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Clock, ExternalLink, Loader2, RefreshCw } from 'lucide-react';

type Props = {
  provider: 'wechatpay' | 'alipay' | null;
  presentation: 'qr_code' | 'redirect' | null;
  codeUrl: string | null;
  redirectUrl: string | null;
  attemptStatus: string;
  expiresAt: string | null;
  polling: boolean;
  busy: boolean;
  onRefresh: () => void;
  onContinueAlipay: (url: string) => void;
};

function useCountdown(expiresAt: string | null): number | null {
  // The remaining time lives in state and is only updated from async
  // callbacks (rAF first frame + 1s ticker) — no synchronous setState in the
  // effect body and no impure Date.now() during render (remediation §4.11.3).
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!expiresAt) return;
    const target = new Date(expiresAt).getTime();
    const update = () => setRemaining(Math.max(0, Math.floor((target - Date.now()) / 1000)));
    const raf = requestAnimationFrame(update);
    const timer = setInterval(update, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [expiresAt]);

  return remaining;
}

export function PaymentStage({
  provider,
  presentation,
  codeUrl,
  redirectUrl,
  attemptStatus,
  expiresAt,
  polling,
  busy,
  onRefresh,
  onContinueAlipay,
}: Props) {
  // QR image generation is async; the effective value is derived at render
  // time so a missing/switched codeUrl needs no synchronous setState reset
  // (remediation §4.11.3).
  const [generatedQr, setGeneratedQr] = useState<{ codeUrl: string; dataUrl: string } | null>(null);
  const remaining = useCountdown(expiresAt);
  const expired = remaining !== null && remaining <= 0;

  useEffect(() => {
    let active = true;
    if (presentation === 'qr_code' && codeUrl) {
      QRCode.toDataURL(codeUrl, { margin: 1, width: 280 })
        .then((url) => {
          if (active) setGeneratedQr({ codeUrl, dataUrl: url });
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [presentation, codeUrl]);

  const qrDataUrl =
    presentation === 'qr_code' && codeUrl && generatedQr?.codeUrl === codeUrl
      ? generatedQr.dataUrl
      : null;

  const countdownLabel = useMemo(() => {
    if (remaining === null) return null;
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, [remaining]);

  if (attemptStatus === 'pending') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border p-6 text-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
        <Loader2 className="h-4 w-4 animate-spin" />
        正在创建支付订单…
      </div>
    );
  }

  if (presentation === 'redirect' && redirectUrl) {
    return (
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
        aria-label="支付宝支付"
      >
        <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>支付宝支付</div>
        <p className="mt-2 text-xs leading-5" style={{ color: 'var(--text-secondary)' }}>
          点击继续将跳转到支付宝完成支付。支付结果以支付宝异步通知为准，返回本页后会自动确认。
        </p>
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: 'var(--color-primary)', color: '#0b0d14' }}
          disabled={busy}
          onClick={() => onContinueAlipay(redirectUrl)}
        >
          <ExternalLink className="h-4 w-4" />
          继续支付
        </button>
      </div>
    );
  }

  if (presentation === 'qr_code') {
    return (
      <div
        className="rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
        aria-label="微信支付二维码"
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>微信支付</div>
          <div
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            {polling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {polling ? '正在检测支付结果' : '等待支付'}
          </div>
        </div>

        <div className="relative mt-4">
          {qrDataUrl ? (
            <img
              alt="微信支付二维码"
              src={qrDataUrl}
              className="mx-auto h-64 w-64"
              style={{ opacity: expired ? 0.25 : 1, transition: 'opacity 0.3s' }}
            />
          ) : (
            <div className="mx-auto flex h-64 w-64 items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
              二维码生成中
            </div>
          )}
          {expired ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>二维码已过期</span>
              <button
                type="button"
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: 'var(--color-primary)', color: '#0b0d14' }}
                disabled={busy}
                onClick={onRefresh}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                刷新二维码
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>打开微信扫一扫完成支付</span>
          {remaining !== null && remaining <= 60 ? (
            <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-warning)' }}>
              <Clock className="h-3.5 w-3.5" />
              {countdownLabel} 后过期
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return null;
}
