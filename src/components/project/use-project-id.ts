"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useProject } from "./project-context";

/**
 * Returns the current project ID with backward compatibility.
 * Priority: URL ?project= param > ProjectContext > null
 * If URL param overrides context, syncs the cookie.
 */
export function useProjectId(): {
  projectId: string | null;
  loading: boolean;
} {
  const { currentProjectId, selectProject, loading } = useProject();
  const searchParams = useSearchParams();
  const urlProject = searchParams.get("project");

  useEffect(() => {
    if (urlProject && urlProject !== currentProjectId) {
      selectProject(urlProject);
    }
  }, [urlProject, currentProjectId, selectProject]);

  return {
    projectId: urlProject || currentProjectId || null,
    loading,
  };
}
