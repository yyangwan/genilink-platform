"use client";

import React, { Suspense, useState, useCallback, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      ? "������������"
      : errorParam === "SessionRequired"
        ? "���ȵ�¼"
        : null;
  const displayedError = error || urlErrorMessage;
  // ─── Email/password login ────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("������������");
        return;
      }

      // Auto-select first workspace after login
      try {
        const wsRes = await fetch("/api/workspaces");
        if (wsRes.ok) {
          const wsData = await wsRes.json();
          const firstWs = wsData.workspaces?.[0];
          if (firstWs) {
            await fetch("/api/workspaces/switch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspaceId: firstWs.id }),
            });
          }
        }
      } catch {
        // Non-critical �?continue to dashboard
      }

      router.push(callbackUrl);
      router.refresh();
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
      const res = await fetch("/api/auth/wechat/qrcode");
      if (!res.ok) throw new Error("QR_ERROR");
      const data = await res.json();
      setQrData(data);
      setQrStatus("pending");
    } catch {
      setQrError("�޷�����΢�Ŷ�ά�룬���Ժ�����");
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
          `/api/auth/wechat/status?scene=${qrData.scene}`
        );
        const data = await res.json();

        if (data.status === "confirmed" && data.token) {
          setQrStatus("confirmed");
          clearInterval(interval);

          // Exchange token for session
          const verifyRes = await fetch("/api/auth/wechat/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: data.token }),
          });

          if (verifyRes.ok) {
            router.push(callbackUrl);
            router.refresh();
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
  }, [qrData, qrStatus, router, callbackUrl]);

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
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold mb-2"
          style={{
            background: "var(--color-primary-dim)",
            color: "var(--color-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          �?        </div>
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
        登录到智�?      </h2>
      <p
        className="text-sm text-center mb-6"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
        }}
      >
        中国GEO全链路平�?      </p>

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

      {/* Email/password form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium mb-1.5"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            邮箱
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
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
            htmlFor="password"
            className="block text-sm font-medium mb-1.5"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            密码
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入密码"
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

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "登录�?.." : "登录"}
        </button>
      </form>

      {/* Register link */}
      <p
        className="mt-4 text-center text-sm"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
        }}
      >
        没有账号�?        <Link
          href="/auth/register"
          style={{
            color: "var(--color-primary)",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          注册
        </Link>
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
          �?        </span>
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
                alt="΢�ŵ�¼��ά��"
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
              刷新二维�?            </button>
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






