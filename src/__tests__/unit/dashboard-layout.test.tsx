// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  auth: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: mocks.cookieGet }),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/get-workspace", () => ({
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: mocks.userFindUnique } } }));
vi.mock("@/lib/auth/ops", () => ({
  effectiveSystemRole: (user: { id: string; systemRole: string }) => (
    (process.env.OPS_USER_IDS || "").split(",").includes(user.id) ? "admin" : user.systemRole
  ),
}));
vi.mock("@/components/sidebar/sidebar", () => ({
  default: ({ showOps }: { showOps?: boolean }) => (
    <div data-testid="sidebar" data-show-ops={String(showOps === true)} />
  ),
}));
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
    vi.unstubAllEnvs();
    mocks.auth.mockResolvedValue({ user: { id: "user-new" } });
    mocks.userFindUnique.mockResolvedValue({ id: "user-new", systemRole: "member" });
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

  it("shows operations navigation for a configured bootstrap administrator", async () => {
    vi.stubEnv("OPS_USER_IDS", "user-new");
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.resolveWorkspaceId.mockResolvedValue("workspace-1");

    render(await DashboardLayout({ children: <div>Dashboard</div> }));

    expect(screen.getByTestId("sidebar").getAttribute("data-show-ops")).toBe("true");
  });
});
