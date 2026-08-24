"use client";

import React, { Suspense, useState, useCallback, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { BrandMark } from "@/components/brand/brand-mark";

type WechatQRState = {
  url: string;
  scene: string;
  expiresAt: number;
} | null;

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ backgroundColor: "var(--bg-base)" }} />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const errorParam = searchParams.get("error");

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WeChat QR state
  const [qrData, setQrData] = useState<WechatQRState>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<
    "idle" | "pending" | "scanned" | "confirmed" | "expired"
  >("idle");

  const urlErrorMessage =
    errorParam === "CredentialsSignin"
      ? "手机号或验证码不正确"
      : errorParam === "SessionRequired"
        ? "请先登录"
        : null;
  const displayedError = error || urlErrorMessage;

  const goToCallback = useCallback((target: string) => {
    const targetUrl = new URL(target, window.location.origin);
    if (targetUrl.origin === window.location.origin) {
      router.push(targetUrl.pathname + targetUrl.search + targetUrl.hash);
      router.refresh();
      return;
    }

    window.location.assign(target);
  }, [router]);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => {
      setCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const handleSendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) {
      setError("请输入正确的中国大陆手机号");
      return;
    }

    setError(null);
    setSendingCode(true);
    try {
      const response = await fetch("/api/auth/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "验证码发送失败，请稍后重试");
        if (response.status === 429 && data.retryAfterSeconds) {
          setCountdown(Math.min(Number(data.retryAfterSeconds), 3600));
        }
        return;
      }
      setCountdown(data.retryAfterSeconds || 60);
    } catch {
      setError("验证码发送失败，请检查网络后重试");
    } finally {
      setSendingCode(false);
    }
  };

  // ─── Phone verification-code login ───────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("phone", {
        phone,
        code,
        redirect: false,
      });

      if (result?.error) {
        setError("手机号或验证码不正确，或验证码已过期");
        return;
      }

      // Auto-select first workspace after login
      try {
        const wsRes = await fetch("/api/workspaces", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          const firstWs = wsData.workspaces?.[0];
          if (firstWs) {
            await fetch("/api/workspaces/switch", {
              method: "POST",
              credentials: "same-origin",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId: firstWs.id }),
            });
          }
        }
      } catch {
        // Non-critical; continue to dashboard
      }

      goToCallback(callbackUrl);
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // ─── WeChat QR code flow ─────────────────────────────────────
  const fetchQRCode = useCallback(async () => {
    setQrLoading(true);
    setQrError(null);
    setQrStatus("idle");

    try {
      const res = await fetch("/api/auth/wechat/qrcode", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("QR_ERROR");
      const data = await res.json();
      setQrData(data);
      setQrStatus("pending");
    } catch {
      setQrError("无法生成微信二维码，请稍后重试");
    } finally {
      setQrLoading(false);
    }
  }, []);

  // Poll WeChat scan status
  useEffect(() => {
    if (!qrData || qrStatus === "confirmed" || qrStatus === "expired") return;

    const interval = setInterval(async () => {
      // Check expiry
      if (Date.now() > qrData.expiresAt) {
        setQrStatus("expired");
        return;
      }

        try {
          const res = await fetch(
          `/api/auth/wechat/status?scene=${qrData.scene}`,
          {
            credentials: "same-origin",
            cache: "no-store",
          }
        );
        const data = await res.json();

        if (data.status === "confirmed" && data.token) {
          setQrStatus("confirmed");
          clearInterval(interval);

          // Exchange token for session
          const verifyRes = await fetch("/api/auth/wechat/verify", {
            method: "POST",
            credentials: "same-origin",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: data.token }),
          });

          if (verifyRes.ok) {
            goToCallback(callbackUrl);
          } else {
            setQrError("微信登录验证失败");
          }
        } else if (data.status === "scanned") {
          setQrStatus("scanned");
        } else if (data.status === "expired") {
          setQrStatus("expired");
          clearInterval(interval);
        }
      } catch {
        // Silently retry on network errors
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [qrData, qrStatus, callbackUrl, goToCallback]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontFamily: "var(--font-body)",
    fontSize: "14px",
    outline: "none",
    transition: "border-color 0.15s",
  };

  const buttonStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "none",
    background: loading ? "var(--bg-hover)" : "var(--color-primary)",
    color: loading ? "var(--text-muted)" : "#0b0d14",
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: "14px",
    cursor: loading ? "not-allowed" : "pointer",
    transition: "background 0.15s",
  };

  return (
    <div className="w-full max-w-[340px]">
      {/* Brand header for mobile (brand panel is hidden on mobile in layout) */}
      <div className="md:hidden flex flex-col items-center mb-6">
        <BrandMark
          className="w-12 h-12 rounded-xl flex items-center justify-center mb-2 [&_svg]:w-9 [&_svg]:h-9"
          signature
        />
        <span
          className="text-lg font-semibold tracking-tight"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          智链
        </span>
      </div>

      {/* Heading */}
      <h2
        className="text-xl font-semibold tracking-tight mb-1 text-center"
        style={{
          color: "var(--text-primary)",
          fontFamily: "var(--font-display)",
        }}
      >
        登录到智链
      </h2>
      <p
        className="text-sm text-center mb-6"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
        }}
      >
        全链路 AI 搜索增长平台
      </p>

      {/* Error banner */}
      {displayedError && (
        <div
          className="mb-4 px-3 py-2 rounded-lg text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-error) 15%, transparent)",
            color: "var(--color-error)",
            border: "1px solid color-mix(in srgb, var(--color-error) 30%, transparent)",
            fontFamily: "var(--font-body)",
          }}
        >
          {displayedError}
        </div>
      )}

      {/* Phone verification-code form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium mb-1.5"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            手机号
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
            placeholder="请输入手机号"
            pattern="1[3-9][0-9]{9}"
            maxLength={11}
            required
            style={inputStyle}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-primary)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--border)")
            }
          />
        </div>

        <div>
          <label
            htmlFor="code"
            className="block text-sm font-medium mb-1.5"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            验证码
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6位验证码"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = "var(--color-primary)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendingCode || countdown > 0}
              className="shrink-0 px-3 rounded-lg text-sm font-medium"
              style={{
                minWidth: "104px",
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: countdown > 0 ? "var(--text-muted)" : "var(--color-primary)",
                cursor: sendingCode || countdown > 0 ? "not-allowed" : "pointer",
              }}
            >
              {sendingCode ? "发送中..." : countdown > 0 ? `${countdown}秒后重发` : "获取验证码"}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "登录中..." : "登录"}
        </button>
      </form>

      <p
        className="mt-4 text-center text-sm"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
        }}
      >
        未注册手机号验证后将自动创建账号
      </p>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div
          className="flex-1 h-px"
          style={{ background: "var(--border)" }}
        />
        <span
          className="text-xs"
          style={{
            color: "var(--text-muted)",
            fontFamily: "var(--font-body)",
          }}
        >
          或
        </span>
        <div
          className="flex-1 h-px"
          style={{ background: "var(--border)" }}
        />
      </div>

      {/* WeChat QR code section */}
      <div className="text-center">
        {!qrData && qrStatus !== "expired" && (
          <button
            onClick={fetchQRCode}
            disabled={qrLoading}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-body)",
              cursor: qrLoading ? "wait" : "pointer",
            }}
          >
            {qrLoading ? "生成二维码中..." : "微信扫码登录"}
          </button>
        )}

        {qrData && qrStatus !== "expired" && (
          <div>
            <div
              className="mx-auto mb-3 rounded-lg overflow-hidden"
              style={{
                width: "200px",
                height: "200px",
                background: "#fff",
                border: "1px solid var(--border)",
              }}
            >
              <Image
                src={qrData.url}
                alt="微信登录二维码"
                width={200}
                height={200}
                unoptimized
              />
            </div>
            <p
              className="text-sm"
              style={{
                color:
                  qrStatus === "scanned"
                    ? "var(--color-success)"
                    : "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              {qrStatus === "scanned"
                ? "扫描成功，请在手机上确认"
                : "请使用微信扫描二维码"}
            </p>
          </div>
        )}

        {qrStatus === "expired" && (
          <div>
            <p
              className="text-sm mb-3"
              style={{
                color: "var(--color-error)",
                fontFamily: "var(--font-body)",
              }}
            >
              二维码已过期
            </p>
            <button
              onClick={() => {
                setQrData(null);
                setQrStatus("idle");
                fetchQRCode();
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-body)",
                cursor: "pointer",
              }}
            >
              刷新二维码
            </button>
          </div>
        )}

        {qrError && (
          <p
            className="mt-2 text-sm"
            style={{
              color: "var(--color-error)",
              fontFamily: "var(--font-body)",
            }}
          >
            {qrError}
          </p>
        )}
      </div>
    </div>
  );
}
