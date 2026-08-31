// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DashboardPage from "@/app/(dashboard)/dashboard/page";
import BrandVoicesPage from "@/app/(dashboard)/content/brand-voices/page";
import TemplatesPage from "@/app/(dashboard)/content/templates/page";

const mocks = vi.hoisted(() => ({
  openWizard: vi.fn(),
  projectContext: {
    currentProjectId: null as string | null,
    currentProject: null,
    projects: [] as Array<{ id: string; name: string }>,
    loading: false,
    openWizard: vi.fn(),
  },
  useSectionFetch: vi.fn(),
}));

vi.mock("@/components/project/project-context", () => ({
  useProject: () => mocks.projectContext,
}));

vi.mock("@/components/dashboard/use-section-fetch", () => ({
  useSectionFetch: (url: string | null) => {
    mocks.useSectionFetch(url);
    return {
      data: null,
      loading: false,
      error: false,
      locked: false,
      refetch: vi.fn(),
    };
  },
}));

describe("new user empty states", () => {
  beforeEach(() => {
    mocks.openWizard.mockReset();
    mocks.useSectionFetch.mockReset();
    mocks.projectContext.currentProjectId = null;
    mocks.projectContext.projects = [];
    mocks.projectContext.loading = false;
    mocks.projectContext.openWizard = mocks.openWizard;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows dashboard onboarding without querying project-scoped data", () => {
    render(<DashboardPage />);

    expect(screen.getByText("先创建一个项目")).toBeTruthy();
    expect(screen.queryByText("智见")).toBeNull();
    expect(mocks.useSectionFetch.mock.calls).toEqual([[null], [null], [null]]);

    fireEvent.click(screen.getByRole("button", { name: "创建第一个项目" }));
    expect(mocks.openWizard).toHaveBeenCalledOnce();
    expect(mocks.openWizard).toHaveBeenCalledWith();
  });

  it.each([
    ["品牌声音", BrandVoicesPage],
    ["内容模板", TemplatesPage],
  ])("shows a project setup action instead of a permanent loader on %s", async (_name, Page) => {
    render(<Page />);

    await waitFor(() => expect(screen.getByText("先创建一个项目")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "创建第一个项目" }));
    expect(mocks.openWizard).toHaveBeenCalledOnce();
  });

  it("asks users with existing projects to select one instead of creating another", () => {
    mocks.projectContext.projects = [{ id: "project-1", name: "示例项目" }];

    render(<TemplatesPage />);

    expect(screen.getByText("先选择一个项目")).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看项目" }).getAttribute("href")).toBe("/projects");
    expect(screen.queryByRole("button", { name: "创建项目" })).toBeNull();
  });
});
