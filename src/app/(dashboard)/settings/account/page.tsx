"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useSession } from "next-auth/react";

import { PageHeader } from "@/components/ui/page-header";

type MessageState = {
  type: "success" | "error";
  text: string;
} | null;

export default function AccountSettingsPage() {
  const { data: session, update } = useSession();
  const [name, setName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [credentialsConfigured, setCredentialsConfigured] = useState<boolean | null>(null);
  const [credentialsLoadFailed, setCredentialsLoadFailed] = useState(false);
  const [credentialsReloadKey, setCredentialsReloadKey] = useState(0);
  const [setupPassword, setSetupPassword] = useState("");
  const [setupPasswordConfirm, setSetupPasswordConfirm] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCredentials, setSavingCredentials] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
    }

    const themeCookie = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("genilink-theme="));

    if (themeCookie) {
      const val = themeCookie.split("=")[1];
      setTheme(val === "light" ? "light" : "dark");
    }
  }, [session]);

  useEffect(() => {
    let active = true;
    setCredentialsLoadFailed(false);
    fetch("/api/user/login-credentials", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("LOAD_FAILED");
        return response.json() as Promise<{ email: string | null; configured: boolean }>;
      })
      .then((data) => {
        if (!active) return;
        setLoginEmail(data.email || "");
        setCredentialsConfigured(data.configured);
      })
      .catch(() => {
        if (!active) return;
        setCredentialsConfigured(null);
        setCredentialsLoadFailed(true);
        setMessage({ type: "error", text: "邮箱登录信息加载失败，请刷新后重试" });
      });
    return () => {
      active = false;
    };
  }, [credentialsReloadKey]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setMessage(null);

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        await update({ name });
        setMessage({ type: "success", text: "个人信息已更新" });
      } else {
        setMessage({ type: "error", text: "更新失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSetupCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (setupPassword !== setupPasswordConfirm) {
      setMessage({ type: "error", text: "两次密码输入不一致" });
      return;
    }

    setSavingCredentials(true);
    setMessage(null);
    try {
      const response = await fetch("/api/user/login-credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: setupPassword, verificationCode }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ type: "error", text: data.error || "邮箱密码设置失败" });
        return;
      }

      setLoginEmail(data.email);
      setCredentialsConfigured(true);
      await update({});
      setSetupPassword("");
      setSetupPasswordConfirm("");
      setVerificationCode("");
      setMessage({ type: "success", text: "邮箱密码登录已启用" });
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleSendVerificationCode = async () => {
    setSendingCode(true);
    setMessage(null);
    try {
      const response = await fetch("/api/user/login-credentials", { method: "PUT" });
      const data = await response.json();
      if (response.ok || response.status === 429) {
        setResendSeconds(Number(data.retryAfterSeconds) || 60);
      }
      setMessage(response.ok
        ? { type: "success", text: "验证码已发送到当前账号绑定的手机号" }
        : { type: "error", text: data.error || "验证码发送失败" });
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSendingCode(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "两次密码输入不一致" });
      return;
    }

    if (newPassword.length < 8) {
      setMessage({ type: "error", text: "密码至少需要 8 个字符" });
      return;
    }

    setSavingPassword(true);
    setMessage(null);

    try {
      const res = await fetch("/api/user/login-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      if (res.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setMessage({ type: "success", text: "密码已更新" });
      } else {
        const data = await res.json();
        setMessage({
          type: "error",
          text: data.error || "密码修改失败",
        });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleThemeToggle = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    document.cookie = `genilink-theme=${newTheme};path=/;max-age=${365 * 24 * 60 * 60}`;
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="账号设置"
        subtitle="管理个人信息、登录方式和外观。"
      />

      {message && (
        <div
          role={message.type === "error" ? "alert" : "status"}
          aria-live={message.type === "error" ? "assertive" : "polite"}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            background:
              message.type === "success"
                ? "var(--color-success)15"
                : "var(--color-error)15",
            color:
              message.type === "success"
                ? "var(--color-success)"
                : "var(--color-error)",
            borderColor:
              message.type === "success"
                ? "var(--color-success)30"
                : "var(--color-error)30",
            fontFamily: "var(--font-body)",
          }}
        >
          {message.text}
        </div>
      )}

      <section className="dashboard-surface dashboard-surface--padded">
        <h2 className="dashboard-panel-title">个人信息</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="space-y-1.5">
            <label className="dashboard-field-label" htmlFor="name">
              姓名
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="dashboard-input"
            />
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="dashboard-button dashboard-button--primary"
            >
              {savingProfile ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </section>

      <section className="dashboard-surface dashboard-surface--padded">
        <h2 className="dashboard-panel-title">邮箱密码登录</h2>
        {credentialsLoadFailed ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>暂时无法读取邮箱登录设置，请稍后重试。</p>
            <button type="button" onClick={() => setCredentialsReloadKey((value) => value + 1)} className="dashboard-button dashboard-button--secondary">
              重新加载
            </button>
          </div>
        ) : credentialsConfigured === null ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>正在加载登录设置...</p>
        ) : !credentialsConfigured ? (
          <form onSubmit={handleSetupCredentials} className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              注册仍需使用手机号。设置后可使用以下邮箱和密码直接登录当前账号。
            </p>
            <div className="space-y-1.5">
              <label className="dashboard-field-label" htmlFor="loginEmail">登录邮箱</label>
              <input
                id="loginEmail"
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="dashboard-input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="dashboard-field-label" htmlFor="verificationCode">手机号验证码</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="verificationCode"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6 位验证码"
                  pattern="[0-9]{6}"
                  required
                  className="dashboard-input min-w-0 flex-1"
                />
                <button type="button" onClick={handleSendVerificationCode} disabled={sendingCode || resendSeconds > 0} className="dashboard-button dashboard-button--secondary min-h-11 whitespace-nowrap">
                  {sendingCode ? "发送中..." : resendSeconds > 0 ? `${resendSeconds} 秒后重发` : "获取验证码"}
                </button>
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                为保护账号安全，首次启用邮箱登录需要验证当前绑定手机号。
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="dashboard-field-label" htmlFor="setupPassword">登录密码</label>
              <input
                id="setupPassword"
                type="password"
                autoComplete="new-password"
                value={setupPassword}
                onChange={(e) => setSetupPassword(e.target.value)}
                placeholder="至少 8 个字符"
                minLength={8}
                required
                className="dashboard-input"
              />
            </div>
            <div className="space-y-1.5">
              <label className="dashboard-field-label" htmlFor="setupPasswordConfirm">确认密码</label>
              <input
                id="setupPasswordConfirm"
                type="password"
                autoComplete="new-password"
                value={setupPasswordConfirm}
                onChange={(e) => setSetupPasswordConfirm(e.target.value)}
                minLength={8}
                required
                className="dashboard-input"
              />
            </div>
            <div className="flex items-center justify-end">
              <button type="submit" disabled={savingCredentials} className="dashboard-button dashboard-button--primary">
                {savingCredentials ? "设置中..." : "启用邮箱密码登录"}
              </button>
            </div>
          </form>
        ) : (
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <label className="dashboard-field-label" htmlFor="configuredEmail">登录邮箱</label>
            <input
              id="configuredEmail"
              type="email"
              value={loginEmail}
              disabled
              className="dashboard-input"
              style={{ opacity: 0.7, cursor: "not-allowed" }}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              登录邮箱绑定后不可自行修改，如需调整请联系管理员。
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="dashboard-field-label" htmlFor="currentPassword">
              当前密码
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="dashboard-input"
            />
          </div>

          <div className="space-y-1.5">
            <label className="dashboard-field-label" htmlFor="newPassword">
              新密码
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少 8 个字符"
              required
              minLength={8}
              className="dashboard-input"
            />
          </div>

          <div className="space-y-1.5">
            <label className="dashboard-field-label" htmlFor="confirmNewPassword">
              确认新密码
            </label>
            <input
              id="confirmNewPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              className="dashboard-input"
            />
          </div>

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="dashboard-button dashboard-button--primary"
            >
              {savingPassword ? "修改中..." : "修改密码"}
            </button>
          </div>
        </form>
        )}
      </section>

      <section className="dashboard-surface dashboard-surface--padded">
        <h2 className="dashboard-panel-title">外观</h2>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
              主题模式
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              {theme === "dark" ? "当前为深色模式" : "当前为浅色模式"}
            </p>
          </div>
          <button
            onClick={handleThemeToggle}
            className="dashboard-button dashboard-button--secondary"
          >
            {theme === "dark" ? (
              <>
                <Sun className="h-4 w-4" />
                浅色模式
              </>
            ) : (
              <>
                <Moon className="h-4 w-4" />
                深色模式
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
