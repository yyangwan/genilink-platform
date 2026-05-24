"use client";

import React from "react";
import Link from "next/link";
import { Plus, Globe, Eye, FileText, Settings } from "lucide-react";
import { useProject } from "@/components/project/project-context";

export default function ProjectsPage() {
  const { projects, loading, openWizard } = useProject();

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
          onClick={() => openWizard()}
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
            onClick={() => openWizard()}
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
            <div
              key={project.id}
              className="rounded-xl p-5 transition-colors group relative"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "var(--color-primary)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "var(--border)")
              }
            >
              {/* Edit button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openWizard(project);
                }}
                className="absolute top-3 right-3 p-1.5 rounded-md transition-colors"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  opacity: 0,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.color = "var(--color-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
                aria-label="编辑项目"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              <Link
                href={`/projects/${project.id}`}
                style={{ textDecoration: "none" }}
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
                    className="flex items-center gap-1.5 mb-2"
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

                {!project.url && <div className="mb-2" />}

                {/* Product info */}
                {project.productName && (
                  <p
                    className="text-xs mb-3 truncate"
                    style={{
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    产品：{project.productName}
                  </p>
                )}

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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
