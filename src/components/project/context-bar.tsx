"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { useProject } from "./project-context";
import { ProjectSelector } from "./project-selector";

export function ContextBar() {
  const pathname = usePathname();
  const { loading } = useProject();

  // Hide on project management pages
  if (pathname === "/projects" || pathname.startsWith("/projects/")) {
    return null;
  }

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
    </div>
  );
}
