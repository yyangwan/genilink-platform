"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

export interface ProjectSummary {
  id: string;
  name: string;
  url: string | null;
  industry: string | null;
  productName: string | null;
  productKeywords: string[];
  productDescription: string | null;
  productUrl: string | null;
}

interface ProjectContextValue {
  projects: ProjectSummary[];
  currentProject: ProjectSummary | null;
  currentProjectId: string | null;
  loading: boolean;
  selectProject: (id: string | null) => void;
  refreshProjects: () => void;
  openWizard: (editProject?: ProjectSummary) => void;
  closeWizard: () => void;
  wizardOpen: boolean;
  wizardEditProject: ProjectSummary | null;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

function readProjectCookie(): string | null {
  if (typeof document === "undefined") return null;
  const cookies = document.cookie.split("; ");
  const cookie = cookies.find((c) => c.startsWith("genilink-project="));
  return cookie?.split("=")[1] || null;
}

function setProjectCookie(id: string | null) {
  if (typeof document === "undefined") return;
  if (id) {
    document.cookie = `genilink-project=${id};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
  } else {
    document.cookie = `genilink-project=;path=/;max-age=0`;
  }
}

interface ProjectProviderProps {
  children: React.ReactNode;
  workspaceId: string | null;
}

export function ProjectProvider({ children, workspaceId }: ProjectProviderProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardEditProject, setWizardEditProject] = useState<ProjectSummary | null>(null);
  const prevWorkspaceId = useRef(workspaceId);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        const list: ProjectSummary[] = (data.projects || []).map((p: Record<string, unknown>) => ({
          id: p.id as string,
          name: p.name as string,
          url: (p.url as string) || null,
          industry: (p.industry as string) || null,
          productName: (p.productName as string) || null,
          productKeywords: (p.productKeywords as string[]) || [],
          productDescription: (p.productDescription as string) || null,
          productUrl: (p.productUrl as string) || null,
        }));
        setProjects(list);

        // Resolve current project: cookie > first project > null
        const cookieId = readProjectCookie();
        const validCookie = cookieId && list.some((p) => p.id === cookieId);
        const resolved = validCookie ? cookieId : list[0]?.id || null;
        setCurrentProjectId(resolved);
        if (resolved !== cookieId) {
          setProjectCookie(resolved);
        }
      }
    } catch {
      // Network error â€?keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch + workspace change detection
  useEffect(() => {
    if (prevWorkspaceId.current !== workspaceId) {
      prevWorkspaceId.current = workspaceId;
      setProjects([]);
      setCurrentProjectId(null);
      setProjectCookie(null);
    }
    if (workspaceId) {
      fetchProjects();
    } else {
      setProjects([]);
      setCurrentProjectId(null);
      setLoading(false);
    }
  }, [workspaceId, fetchProjects]);

  const selectProject = useCallback(
    (id: string | null) => {
      setCurrentProjectId(id);
      setProjectCookie(id);
      // Fire-and-forget server validation
      if (id) {
        fetch("/api/projects/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: id }),
        }).catch(() => {});
      }
    },
    []
  );

  const refreshProjects = useCallback(async () => {
    await fetchProjects();
  }, [fetchProjects]);

  const openWizard = useCallback((editProject?: ProjectSummary) => {
    setWizardEditProject(editProject || null);
    setWizardOpen(true);
  }, []);

  const closeWizard = useCallback(() => {
    setWizardOpen(false);
    setWizardEditProject(null);
  }, []);

  const currentProject = projects.find((p) => p.id === currentProjectId) || null;

  return (
    <ProjectContext.Provider
      value={{
        projects,
        currentProject,
        currentProjectId,
        loading,
        selectProject,
        refreshProjects,
        openWizard,
        closeWizard,
        wizardOpen,
        wizardEditProject,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

