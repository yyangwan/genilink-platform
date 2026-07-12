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
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
      setEmail(session.user.email || "");
    }

    const themeCookie = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("genilink-theme="));

    if (themeCookie) {
      const val = themeCookie.split("=")[1];
      setTheme(val === "light" ? "light" : "dark");
    }
  }, [session]);

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
      const res = await fetch("/api/user/password", {
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
        subtitle="管理个人信息、密码和外观。"
      />

      {message && (
        <div
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

          <div className="space-y-1.5">
            <label className="dashboard-field-label" htmlFor="email">
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              disabled
              className="dashboard-input"
              style={{ opacity: 0.7, cursor: "not-allowed" }}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              邮箱当前不支持修改
            </p>
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
        <h2 className="dashboard-panel-title">修改密码</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
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
