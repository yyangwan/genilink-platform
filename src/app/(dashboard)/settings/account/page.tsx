"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Sun, Moon } from "lucide-react";

export default function AccountSettingsPage() {
  const { data: session, update } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
      setEmail(session.user.email || "");
    }

    // Read theme from cookie
    const cookies = document.cookie.split("; ");
    const themeCookie = cookies.find((c) =>
      c.startsWith("genilink-theme=")
    );
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
      setMessage({ type: "error", text: "密码至少需要8个字符" });
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
    document.cookie = `genilink-theme=${newTheme};path=/;max-age=${
      365 * 24 * 60 * 60
    }`;
    // Apply theme class to document for CSS variable switching
    document.documentElement.setAttribute("data-theme", newTheme);
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

  const sectionCard: React.CSSProperties = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: "12px",
    padding: "24px",
  };

  return (
    <div className="space-y-6">

      {/* Message */}
      {message && (
        <div
          className="px-3 py-2 rounded-lg text-sm"
          style={{
            background:
              message.type === "success"
                ? "var(--color-success)15"
                : "var(--color-error)15",
            color:
              message.type === "success"
                ? "var(--color-success)"
                : "var(--color-error)",
            border:
              message.type === "success"
                ? "1px solid var(--color-success)30"
                : "1px solid var(--color-error)30",
            fontFamily: "var(--font-body)",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Profile section */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          个人信息
        </h3>
        <form onSubmit={handleSaveProfile} className="space-y-4">
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
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor =
                  "var(--color-primary)")
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
              disabled
              style={{
                ...inputStyle,
                opacity: 0.6,
                cursor: "not-allowed",
              }}
            />
            <p
              className="mt-1 text-xs"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-body)",
              }}
            >
              邮箱暂不支持修改
            </p>
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: savingProfile
                ? "var(--bg-hover)"
                : "var(--color-primary)",
              color: savingProfile
                ? "var(--text-muted)"
                : "#0b0d14",
              border: "none",
              fontFamily: "var(--font-display)",
              cursor: savingProfile ? "not-allowed" : "pointer",
            }}
          >
            {savingProfile ? "保存中..." : "保存"}
          </button>
        </form>
      </div>

      {/* Password section */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          修改密码
        </h3>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label
              htmlFor="currentPassword"
              className="block text-sm font-medium mb-1.5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              当前密码
            </label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor =
                  "var(--color-primary)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            />
          </div>
          <div>
            <label
              htmlFor="newPassword"
              className="block text-sm font-medium mb-1.5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              新密码
            </label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="至少8个字符"
              required
              minLength={8}
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor =
                  "var(--color-primary)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            />
          </div>
          <div>
            <label
              htmlFor="confirmNewPassword"
              className="block text-sm font-medium mb-1.5"
              style={{
                color: "var(--text-secondary)",
                fontFamily: "var(--font-body)",
              }}
            >
              确认新密码
            </label>
            <input
              id="confirmNewPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              style={inputStyle}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor =
                  "var(--color-primary)")
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            />
          </div>
          <button
            type="submit"
            disabled={savingPassword}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: savingPassword
                ? "var(--bg-hover)"
                : "var(--color-primary)",
              color: savingPassword
                ? "var(--text-muted)"
                : "#0b0d14",
              border: "none",
              fontFamily: "var(--font-display)",
              cursor: savingPassword ? "not-allowed" : "pointer",
            }}
          >
            {savingPassword ? "修改中..." : "修改密码"}
          </button>
        </form>
      </div>

      {/* Theme toggle */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          外观
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <p
              className="text-sm font-medium"
              style={{
                color: "var(--text-primary)",
                fontFamily: "var(--font-body)",
              }}
            >
              主题模式
            </p>
            <p
              className="text-xs mt-0.5"
              style={{
                color: "var(--text-muted)",
                fontFamily: "var(--font-body)",
              }}
            >
              {theme === "dark" ? "当前：深色模式" : "当前：浅色模式"}
            </p>
          </div>
          <button
            onClick={handleThemeToggle}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              fontFamily: "var(--font-body)",
              cursor: "pointer",
            }}
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-4 h-4" />
                浅色模式
              </>
            ) : (
              <>
                <Moon className="w-4 h-4" />
                深色模式
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
