"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useCallback } from "react";
import { UserPlus, Shield, Mail } from "lucide-react";

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
      // Fetch workspaces and find current one
      const wsRes = await fetch("/api/workspaces");
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        // Read current workspace from cookie
        const cookies = document.cookie.split("; ");
        const wsCookie = cookies.find((c) => c.startsWith("genilink-workspace="));
        const currentId = wsCookie?.split("=")[1];
        const current = wsData.workspaces?.find(
          (w: WorkspaceInfo & { id: string }) => w.id === currentId
        ) || wsData.workspaces?.[0];
        if (current) {
          setWorkspace(current);
          setEditName(current.name);

          // Fetch members for this workspace
          const membersRes = await fetch(`/api/workspaces/members?workspaceId=${current.id}`);
          if (membersRes.ok) {
            const membersData = await membersRes.json();
            setMembers(membersData.members || []);
          }
        }
      }
    } catch {
      // Silently fail
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
      const res = await fetch(`/api/workspaces`, {
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
      const res = await fetch(`/api/workspaces/invite`, {
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

  if (loading) {
    return (
      <div className="space-y-6">
        <div
          className="animate-skeleton-pulse rounded-xl"
          style={{ ...sectionCard, height: "120px" }}
        />
        <div
          className="animate-skeleton-pulse rounded-xl"
          style={{ ...sectionCard, height: "200px" }}
        />
      </div>
    );
  }

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

      {/* Workspace name */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          工作区名称
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            style={inputStyle}
            onFocus={(e) =>
              (e.currentTarget.style.borderColor = "var(--color-primary)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.borderColor = "var(--border)")
            }
          />
          <button
            onClick={handleSaveName}
            disabled={saving || editName === workspace?.name}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0 transition-colors"
            style={{
              background:
                saving || editName === workspace?.name
                  ? "var(--bg-hover)"
                  : "var(--color-primary)",
              color:
                saving || editName === workspace?.name
                  ? "var(--text-muted)"
                  : "#0b0d14",
              border: "none",
              fontFamily: "var(--font-display)",
              cursor:
                saving || editName === workspace?.name
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>

      {/* Members */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          成员
        </h3>
        {members.length === 0 ? (
          <p
            className="text-sm"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            暂无其他成员
          </p>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg"
                style={{ background: "var(--bg-elevated)" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
                    style={{
                      background: "var(--color-primary-dim)",
                      color: "var(--color-primary)",
                    }}
                  >
                    {member.user.name?.charAt(0) || "?"}
                  </div>
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-body)",
                      }}
                    >
                      {member.user.name}
                    </p>
                    <p
                      className="text-xs"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {member.user.email}
                    </p>
                  </div>
                </div>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                  style={{
                    background:
                      member.role === "owner"
                        ? "var(--color-primary-dim)"
                        : "var(--bg-hover)",
                    color:
                      member.role === "owner"
                        ? "var(--color-primary)"
                        : "var(--text-secondary)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {member.role === "owner" && (
                    <Shield className="w-3 h-3" />
                  )}
                  {member.role === "owner" ? "管理员" : "成员"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite section */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{
            color: "var(--text-primary)",
            fontFamily: "var(--font-display)",
          }}
        >
          邀请成员
        </h3>
        <form onSubmit={handleInvite} className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Mail
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="输入邮箱地址"
              required
              style={{
                ...inputStyle,
                paddingLeft: "36px",
              }}
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
            disabled={inviteLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold shrink-0 transition-colors"
            style={{
              background: inviteLoading
                ? "var(--bg-hover)"
                : "var(--color-primary)",
              color: inviteLoading
                ? "var(--text-muted)"
                : "#0b0d14",
              border: "none",
              fontFamily: "var(--font-display)",
              cursor: inviteLoading ? "not-allowed" : "pointer",
            }}
          >
            <UserPlus className="w-4 h-4" />
            {inviteLoading ? "发送中..." : "邀请"}
          </button>
        </form>
      </div>
    </div>
  );
}
