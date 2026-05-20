"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useProject } from "./project-context";
import { ProjectSelector } from "./project-selector";
import { Breadcrumb } from "@/components/ui/breadcrumb";

const PATH_LABELS: Record<string, string> = {
  dashboard: "工作台",
  visibility: "可见性分析",
  audits: "审计记录",
  schedules: "定时任务",
  suggestions: "优化建议",
  trends: "趋势分析",
  compare: "竞品对比",
  content: "智创",
  projects: "项目管理",
  settings: "设置",
  brands: "品牌管理",
  prompts: "提示词管理",
  account: "账户",
  billing: "订阅",
  workspace: "工作区",
};

const PATH_PARENT: Record<string, string> = {
  visibility: "智見",
  audits: "智見",
  schedules: "智見",
  suggestions: "智見",
  trends: "智見",
  compare: "智見",
  content: "智創",
};

function buildBreadcrumb(pathname: string): Array<{ label: string; href?: string }> {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "智链" }];

  const items: Array<{ label: string; href?: string }> = [{ label: "智链", href: "/dashboard" }];
  const mainSegment = segments[0];
  const parent = PATH_PARENT[mainSegment];

  if (parent) {
    items.push({ label: parent });
  }

  const label = PATH_LABELS[mainSegment] || mainSegment;
  const isLast = segments.length <= 1;
  items.push({ label, href: isLast ? undefined : `/${mainSegment}` });

  if (segments.length > 1) {
    const subLabel = PATH_LABELS[segments[1]] || segments[1];
    items.push({ label: subLabel });
  }

  return items;
}

export function ContextBar() {
  const pathname = usePathname();
  const { loading } = useProject();

  // Hide on project management pages
  if (pathname === "/projects" || pathname.startsWith("/projects/")) {
    return null;
  }

  const breadcrumbItems = buildBreadcrumb(pathname);

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        height: 40,
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        padding: "0 var(--space-lg)",
        gap: "var(--space-sm)",
      }}
    >
      <ProjectSelector />
      <div style={{ marginLeft: 8 }}>
        <Breadcrumb items={breadcrumbItems} />
      </div>
    </div>
  );
}
