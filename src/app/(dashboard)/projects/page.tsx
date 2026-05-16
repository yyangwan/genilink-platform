"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Globe, Eye, FileText } from "lucide-react";

interface Project {
  id: string;
  name: string;
  url: string | null;
  industry: string | null;
  createdAt: string;
  externalMappings: { service: string; externalId: string }[];
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, url: newUrl || undefined }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "创建失败");
        return;
      }

      setShowCreate(false);
      setNewName("");
      setNewUrl("");
      fetchProjects();
    } catch {
      setError("创建失败，请重试");
    } finally {
      setCreating(false);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sectionHeading)",
            }}
          >
            项目管理
          </h1>
          <p
            className="mt-1 text-sm"
            style={{
              color: "var(--text-secondary)",
              fontFamily: "var(--font-body)",
            }}
          >
            管理你的网站追踪项目
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          style={{
            background: "var(--color-primary)",
            color: "#0b0d14",
            fontFamily: "var(--font-display)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Plus className="w-4 h-4" />
          新建项目
        </button>
      </div>

      {/* Create form modal/inline */}
      {showCreate && (
        <div
          className="rounded-xl p-6"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <h3
            className="text-base font-semibold mb-4"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}
          >
            新建项目
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-body)",
                }}
              >
                项目名称
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="输入项目名称"
                required
                style={inputStyle}
                autoFocus
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
                className="block text-sm font-medium mb-1.5"
                style={{
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-body)",
                }}
              >
                网站URL
              </label>
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://example.com"
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
            {error && (
              <p
                className="text-sm"
                style={{
                  color: "var(--color-error)",
                  fontFamily: "var(--font-body)",
                }}
              >
                {error}
              </p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  background: creating
                    ? "var(--bg-hover)"
                    : "var(--color-primary)",
                  color: creating ? "var(--text-muted)" : "#0b0d14",
                  border: "none",
                  fontFamily: "var(--font-display)",
                  cursor: creating ? "not-allowed" : "pointer",
                }}
              >
                {creating ? "创建中..." : "创建"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreate(false);
                  setError(null);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: "transparent",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  fontFamily: "var(--font-body)",
                  cursor: "pointer",
                }}
              >
                取消
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Project list */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl p-5 animate-skeleton-pulse"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                height: "160px",
              }}
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div
          className="rounded-xl p-12 text-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <p
            className="text-sm mb-3"
            style={{
              color: "var(--text-muted)",
              fontFamily: "var(--font-body)",
            }}
          >
            暂无项目
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{
              background: "var(--color-primary)",
              color: "#0b0d14",
              border: "none",
              fontFamily: "var(--font-display)",
              cursor: "pointer",
            }}
          >
            创建第一个项目
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="rounded-xl p-5 transition-colors group block"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                textDecoration: "none",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor =
                  "var(--color-primary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            >
              {/* Project name */}
              <h3
                className="text-base font-semibold mb-2 truncate"
                style={{
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-display)",
                }}
              >
                {project.name}
              </h3>

              {/* URL */}
              {project.url && (
                <div
                  className="flex items-center gap-1.5 mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span
                    className="text-xs truncate"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {project.url}
                  </span>
                </div>
              )}

              {!project.url && <div className="mb-4" />}

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{
                    background: "var(--color-primary-dim)",
                    color: "var(--color-primary)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  <Eye className="w-3 h-3" />
                  可见性
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  <FileText className="w-3 h-3" />
                  内容
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
