"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }

    if (password.length < 8) {
      setError("密码至少需要8个字符");
      return;
    }

    setLoading(true);

    try {
      // Register the user
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError("该邮箱已被注册");
        } else {
          setError(data.error || "注册失败，请稍后重试");
        }
        return;
      }

      // Auto sign in after registration
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        // Registration succeeded but auto-login failed — redirect to login
        router.push("/auth/login");
        return;
      }

      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

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
      {/* Brand header for mobile */}
      <div className="md:hidden flex flex-col items-center mb-6">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold mb-2"
          style={{
            background: "var(--color-primary-dim)",
            color: "var(--color-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          智
        </div>
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
        创建账号
      </h2>
      <p
        className="text-sm text-center mb-6"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
        }}
      >
        开始使用智链平台
      </p>

      {/* Error banner */}
      {error && (
        <div
          className="mb-4 px-3 py-2 rounded-lg text-sm"
          style={{
            background: "color-mix(in srgb, var(--color-error) 10%, transparent)",
            color: "var(--color-error)",
            border: "1px solid color-mix(in srgb, var(--color-error) 30%, transparent)",
            fontFamily: "var(--font-body)",
          }}
        >
          {error}
        </div>
      )}

      {/* Registration form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium mb-1.5"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            姓名
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入姓名"
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
            placeholder="至少8个字符"
            required
            minLength={8}
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
            htmlFor="confirmPassword"
            className="block text-sm font-medium mb-1.5"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            确认密码
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再次输入密码"
            required
            minLength={8}
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
          {loading ? "注册中..." : "注册"}
        </button>
      </form>

      {/* Login link */}
      <p
        className="mt-4 text-center text-sm"
        style={{
          color: "var(--text-secondary)",
          fontFamily: "var(--font-body)",
        }}
      >
        已有账号？
        <Link
          href="/auth/login"
          style={{
            color: "var(--color-primary)",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          登录
        </Link>
      </p>
    </div>
  );
}
