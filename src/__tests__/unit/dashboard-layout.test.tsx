// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  auth: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: mocks.cookieGet }),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/get-workspace", () => ({
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}));
vi.mock("@/components/sidebar/sidebar", () => ({ default: () => null }));
vi.mock("@/components/project/context-bar", () => ({ ContextBar: () => null }));
vi.mock("@/components/project/project-wizard", () => ({ ProjectWizard: () => null }));
vi.mock("@/components/project/project-provider", () => ({
  ProjectProviderWrapper: ({
    workspaceId,
    children,
  }: {
    workspaceId: string | null;
    children: React.ReactNode;
  }) => (
    <div data-testid="project-provider" data-workspace-id={workspaceId ?? ""}>
      {children}
    </div>
  ),
}));

import DashboardLayout from "@/app/(dashboard)/layout";

describe("DashboardLayout workspace resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-new" } });
  });

  afterEach(cleanup);

  it("does not trust a workspace cookie until membership is validated", async () => {
    mocks.cookieGet.mockReturnValue({ value: "ws-from-another-account" });
    mocks.resolveWorkspaceId.mockResolvedValue(null);

    render(await DashboardLayout({ children: <div>Dashboard</div> }));

    expect(mocks.resolveWorkspaceId).toHaveBeenCalledWith(
      "user-new",
      "ws-from-another-account",
    );
    expect(
      screen.getByTestId("project-provider").getAttribute("data-workspace-id"),
    ).toBe("");
  });
});
