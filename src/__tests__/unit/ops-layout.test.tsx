// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOps: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }),
  notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }),
  usePathname: vi.fn(() => "/ops/leads/lead_1"),
}));

vi.mock("@/lib/auth/ops", () => ({
  OpsAuthorizationError: class OpsAuthorizationError extends Error {
    constructor(public readonly status: 401 | 403) { super("DENIED"); }
  },
  requireOps: mocks.requireOps,
}));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  usePathname: mocks.usePathname,
}));

import OpsLayout from "@/app/ops/layout";
import { OpsAuthorizationError } from "@/lib/auth/ops";

describe("internal operations layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOps.mockResolvedValue({ id: "operator-1", name: "运营员", email: null, systemRole: "ops" });
  });

  afterEach(cleanup);

  it("renders a separate operations shell with internal navigation", async () => {
    render(await OpsLayout({ children: <div>线索详情</div> }));

    expect(screen.getByText("智链内部运营")).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "内部运营导航" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "获客转化" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "合作线索" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "返回产品工作台" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.getByText("线索详情")).toBeTruthy();
  });

  it("sends signed-out users to login", async () => {
    mocks.requireOps.mockRejectedValue(new OpsAuthorizationError(401));

    await expect(OpsLayout({ children: <div /> })).rejects.toThrow("REDIRECT:/auth/login?callbackUrl=%2Fops");
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("returns not found for a signed-in account without operations access", async () => {
    mocks.requireOps.mockRejectedValue(new OpsAuthorizationError(403));

    await expect(OpsLayout({ children: <div /> })).rejects.toThrow("NOT_FOUND");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
