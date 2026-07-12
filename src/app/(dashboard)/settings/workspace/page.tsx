"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useState } from "react";
import { Mail, Shield, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/ui/page-header";

interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
  user: {
    name: string;
    email: string | null;
    image: string | null;
  };
}

interface WorkspaceInfo {
  id: string;
  name: string;
  industry: string | null;
}

export default function WorkspaceSettingsPage() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchWorkspaceData = useCallback(async () => {
    try {
      const wsRes = await fetch("/api/workspaces");
      if (!wsRes.ok) {
        return;
      }

      const wsData = await wsRes.json();
      const cookies = document.cookie.split("; ");
      const wsCookie = cookies.find((cookie) => cookie.startsWith("genilink-workspace="));
      const currentId = wsCookie?.split("=")[1];
      const current =
        wsData.workspaces?.find((item: WorkspaceInfo & { id: string }) => item.id === currentId) ||
        wsData.workspaces?.[0];

      if (!current) {
        return;
      }

      setWorkspace(current);
      setEditName(current.name);

      const membersRes = await fetch(`/api/workspaces/members?workspaceId=${current.id}`);
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(membersData.members || []);
      }
    } catch {
      // Keep the page usable even if the workspace API is unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkspaceData();
  }, [fetchWorkspaceData]);

  const handleSaveName = async () => {
    if (!editName.trim() || !workspace) return;
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/workspaces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, name: editName }),
      });

      if (res.ok) {
        setWorkspace({ ...workspace, name: editName });
        setMessage({ type: "success", text: "工作区名称已更新" });
      } else {
        setMessage({ type: "error", text: "更新失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviteLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/workspaces/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace?.id,
          email: inviteEmail,
        }),
      });

      if (res.ok) {
        setInviteEmail("");
        setMessage({ type: "success", text: "邀请已发送" });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "邀请失败" });
      }
    } catch {
      setMessage({ type: "error", text: "网络错误" });
    } finally {
      setInviteLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="dashboard-surface dashboard-surface--padded">
          <div className="dashboard-skeleton h-6 w-40" />
          <div className="dashboard-skeleton mt-4 h-10 w-full" />
        </div>
        <div className="dashboard-surface dashboard-surface--padded">
          <div className="dashboard-skeleton h-6 w-32" />
          <div className="mt-4 space-y-2">
            <div className="dashboard-skeleton h-12 w-full" />
            <div className="dashboard-skeleton h-12 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="工作区设置"
        subtitle="管理工作区名称、成员和邀请。"
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
        <h2 className="dashboard-panel-title">工作区名称</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="dashboard-input"
          />
          <button
            onClick={handleSaveName}
            disabled={saving || editName === workspace?.name}
            className="dashboard-button dashboard-button--primary shrink-0"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </section>

      <section className="dashboard-surface dashboard-surface--padded">
        <h2 className="dashboard-panel-title">成员</h2>
        {members.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            暂无其他成员
          </p>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-4 rounded-lg px-3 py-2"
                style={{ background: "var(--bg-card)" }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold"
                    style={{
                      background: "var(--color-primary-dim)",
                      color: "var(--color-primary)",
                      fontFamily: "var(--font-display)",
                    }}
                  >
                    {member.user.name?.charAt(0) || "?"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" style={{ color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
                      {member.user.name}
                    </p>
                    <p className="truncate text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {member.user.email}
                    </p>
                  </div>
                </div>
                <span
                  className="dashboard-chip"
                  style={{
                    background:
                      member.role === "owner"
                        ? "var(--color-primary-dim)"
                        : "var(--bg-card)",
                    color:
                      member.role === "owner"
                        ? "var(--color-primary)"
                        : "var(--text-secondary)",
                  }}
                >
                  {member.role === "owner" ? (
                    <>
                      <Shield className="h-3 w-3" />
                      管理员
                    </>
                  ) : (
                    "成员"
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="dashboard-surface dashboard-surface--padded">
        <h2 className="dashboard-panel-title">邀请成员</h2>
        <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="输入邮箱地址"
              required
              className="dashboard-input pl-9"
            />
          </div>
          <button
            type="submit"
            disabled={inviteLoading}
            className="dashboard-button dashboard-button--primary shrink-0"
          >
            <UserPlus className="h-4 w-4" />
            {inviteLoading ? "发送中..." : "邀请"}
          </button>
        </form>
      </section>
    </div>
  );
}
