// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectWizard } from "@/components/project/project-wizard";

const mocks = vi.hoisted(() => ({
  closeWizard: vi.fn(),
  refreshProjects: vi.fn(),
  selectProject: vi.fn(),
  addToast: vi.fn(),
  routerRefresh: vi.fn(),
  projectContext: {
    projects: [],
    currentProject: null,
    currentProjectId: null,
    workspaceId: null as string | null,
    loading: false,
    selectProject: vi.fn(),
    refreshProjects: vi.fn(),
    openWizard: vi.fn(),
    closeWizard: vi.fn(),
    wizardOpen: true,
    wizardEditProject: null,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh }),
}));

vi.mock("@/components/project/project-context", () => ({
  useProject: () => ({
    ...mocks.projectContext,
    closeWizard: mocks.closeWizard,
    refreshProjects: mocks.refreshProjects,
    selectProject: mocks.selectProject,
  }),
}));

vi.mock("@/components/ui/toast-context", () => ({
  useToast: () => ({ addToast: mocks.addToast }),
}));

describe("ProjectWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectContext.workspaceId = null;
    mocks.projectContext.wizardEditProject = null;
    mocks.refreshProjects.mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ workspaceId: "ws-new", projectId: "proj-new" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("initializes onboarding when a new user creates the first project without a workspace", async () => {
    render(<ProjectWizard />);

    fireEvent.change(screen.getAllByPlaceholderText("例如：我的品牌")[0], {
      target: { value: "Alpha" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /下一步/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /下一步/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "创建项目" })[0]);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/onboarding",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    ));

    const [, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      workspaceName: "Alpha",
      projectName: "Alpha",
    });
    expect(mocks.selectProject).toHaveBeenCalledWith("proj-new");
    expect(mocks.routerRefresh).toHaveBeenCalledOnce();
    expect(mocks.closeWizard).toHaveBeenCalledOnce();
  });

  it("keeps using the project API when the current workspace already exists", async () => {
    mocks.projectContext.workspaceId = "ws-existing";
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ project: { id: "proj-existing" } }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<ProjectWizard />);

    fireEvent.change(screen.getAllByPlaceholderText("例如：我的品牌")[0], {
      target: { value: "Beta" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /下一步/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /下一步/ })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "创建项目" })[0]);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
      }),
    ));

    expect(mocks.selectProject).toHaveBeenCalledWith("proj-existing");
    expect(mocks.routerRefresh).not.toHaveBeenCalled();
  });
});
