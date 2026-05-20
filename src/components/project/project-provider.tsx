"use client";

import { ProjectProvider } from "./project-context";

export function ProjectProviderWrapper({
  children,
  workspaceId,
}: {
  children: React.ReactNode;
  workspaceId: string | null;
}) {
  return <ProjectProvider workspaceId={workspaceId}>{children}</ProjectProvider>;
}
