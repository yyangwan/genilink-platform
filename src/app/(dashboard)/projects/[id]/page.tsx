"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useProject } from "@/components/project/project-context";
import {
  ArrowLeft,
  Globe,
  Building2,
  Calendar,
  Eye,
  LayoutDashboard,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

const sectionCard: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "24px",
};

interface ProjectData {
  id: string;
  name: string;
  url: string | null;
  industry: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  externalMappings: { service: string; externalId: string }[];
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { selectProject } = useProject();
  const projectId = params.id as string;

  const navigateWithProject = (path: string) => {
    selectProject(projectId);
    router.push(path);
  };

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        if (data?.project) {
          setProject(data.project);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 rounded animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
        <div className="h-48 rounded-xl animate-skeleton-pulse" style={{ background: "var(--bg-hover)" }} />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="p-2 rounded-lg transition-colors"
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "none" }}
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>
        <div style={sectionCard}>
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-10 h-10 mb-3" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
              项目不存在或无权访问
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasVisibilityMapping = project.externalMappings.some((m) => m.service === "visibility");

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link
          href="/projects"
          className="p-2 rounded-lg transition-colors"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-sectionHeading)",
            }}
          >
            {project.name}
          </h1>
        </div>
      </div>

      {/* Project info card */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          项目信息
        </h3>
        <div className="space-y-4">
          {project.url && (
            <div className="flex items-center gap-3">
              <Globe className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                {project.url}
              </span>
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded"
                style={{ color: "var(--text-muted)" }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
          {project.industry && (
            <div className="flex items-center gap-3">
              <Building2 className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
                {project.industry}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 shrink-0" style={{ color: "var(--text-muted)" }} />
            <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              创建于 {new Date(project.createdAt).toLocaleDateString("zh-CN")}
            </span>
          </div>
        </div>
      </div>

      {/* Analysis status card */}
      <div style={sectionCard}>
        <h3
          className="text-base font-semibold mb-4"
          style={{ color: "var(--text-primary)", fontFamily: "var(--font-display)" }}
        >
          分析状态
        </h3>
        {hasVisibilityMapping ? (
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--color-success)" }}
            />
            <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              已关联智見分析服务
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: "var(--color-warning)" }}
            />
            <span className="text-sm" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
              尚未关联分析服务
            </span>
          </div>
        )}
      </div>

      {/* Action links */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => navigateWithProject("/visibility")}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--color-primary)",
            color: "#0b0d14",
            fontFamily: "var(--font-body)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--color-primary)")}
        >
          <Eye className="w-4 h-4" />
          查看分析
        </button>
        <button
          onClick={() => navigateWithProject("/dashboard")}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-colors"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
        >
          <LayoutDashboard className="w-4 h-4" />
          工作台
        </button>
      </div>
    </div>
  );
}
