// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const selectProject = vi.fn();
const addToast = vi.fn();

vi.mock("@/components/project/project-context", () => ({
  useProject: () => ({
    projects: [
      { id: "project-a", name: "项目 A" },
      { id: "project-b", name: "项目 B" },
    ],
    currentProject: { id: "project-a", name: "项目 A" },
    selectProject,
    openWizard: vi.fn(),
    loading: false,
  }),
}));

vi.mock("@/components/ui/toast-context", () => ({
  useToast: () => ({ addToast }),
}));

import { ProjectSelector } from "@/components/project/project-selector";

describe("ProjectSelector mobile sheet", () => {
  beforeEach(() => {
    selectProject.mockClear();
    addToast.mockClear();
  });

  it("selects a project when the mobile tap emits mousedown before click", () => {
    render(<ProjectSelector />);

    fireEvent.click(screen.getByRole("button", { name: /项目 A/ }));
    const mobileOption = screen.getAllByRole("option", { name: "项目 B" })[1];

    fireEvent.mouseDown(mobileOption);
    fireEvent.click(mobileOption);

    expect(selectProject).toHaveBeenCalledWith("project-b");
    expect(addToast).toHaveBeenCalledWith({ type: "success", title: "已切换项目" });
  });
});
