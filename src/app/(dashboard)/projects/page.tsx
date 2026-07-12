"use client";

import React from "react";
import Link from "next/link";
import { Eye, FileText, Globe, Plus, Settings } from "lucide-react";

import { useProject } from "@/components/project/project-context";
import { PageHeader } from "@/components/ui/page-header";

export default function ProjectsPage() {
  const { projects, loading, openWizard } = useProject();

  return (
    <div className="space-y-6">
      <PageHeader
        title="项目管理"
        subtitle="管理你的站点追踪项目。"
        actions={
          <button
            onClick={() => openWizard()}
            className="dashboard-button dashboard-button--primary"
          >
            <Plus className="h-4 w-4" />
            新建项目
          </button>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="dashboard-surface dashboard-surface--padded dashboard-skeleton h-40"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="dashboard-surface dashboard-surface--padded text-center">
          <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
            暂无项目
          </p>
          <button
            onClick={() => openWizard()}
            className="dashboard-button dashboard-button--primary mt-4"
          >
            创建第一个项目
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="dashboard-surface dashboard-surface--padded group relative transition-colors"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openWizard(project);
                }}
                className="dashboard-icon-button absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="编辑项目"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>

              <Link href={`/projects/${project.id}`} className="block no-underline">
                <h3
                  className="mb-2 truncate text-base font-semibold"
                  style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
                >
                  {project.name}
                </h3>

                {project.url && (
                  <div className="mb-2 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                    <Globe className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-xs" style={{ fontFamily: "var(--font-mono)" }}>
                      {project.url}
                    </span>
                  </div>
                )}

                {!project.url && <div className="mb-2" />}

                {project.productName && (
                  <p className="mb-3 truncate text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                    产品：{project.productName}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="dashboard-chip" style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}>
                    <Eye className="h-3 w-3" />
                    可见性
                  </span>
                  <span className="dashboard-chip" style={{ background: "var(--bg-card)", color: "var(--text-secondary)" }}>
                    <FileText className="h-3 w-3" />
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
