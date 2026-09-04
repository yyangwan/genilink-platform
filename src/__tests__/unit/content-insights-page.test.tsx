// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContentInsightsPage from "@/app/(dashboard)/content/insights/page";

const mocks = vi.hoisted(() => ({
  useSectionFetch: vi.fn(),
}));

vi.mock("@/components/project/project-context", () => ({
  useProject: () => ({
    currentProjectId: "project-1",
    currentProject: { id: "project-1", productName: "示例产品" },
    projects: [{ id: "project-1", name: "示例项目" }],
    loading: false,
    openWizard: vi.fn(),
  }),
}));

vi.mock("@/components/dashboard/use-section-fetch", () => ({
  useSectionFetch: (url: string | null) => {
    mocks.useSectionFetch(url);
    return {
      data: {
        data: {
          totalContent: 12,
          publishedCount: 7,
          avgQuality: 86.5,
          platformBreakdown: [{ platform: "微信公众号", count: 4 }],
          statusBreakdown: [{ status: "published", count: 7 }],
          topPerforming: [{ id: "content-1", title: "高质量内容示例", score: 92 }],
          recentActivity: [],
        },
      },
      loading: false,
      error: false,
      locked: false,
      refetch: vi.fn(),
    };
  },
}));

describe("智创内容洞察页面", () => {
  beforeEach(() => {
    mocks.useSectionFetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("读取智创内容表现数据，而不是智见审计洞察", () => {
    render(<ContentInsightsPage />);

    expect(screen.getByText("分析内容表现和质量趋势")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("86.5")).toBeTruthy();
    expect(screen.getByText("微信公众号")).toBeTruthy();
    expect(screen.getByText("高质量内容示例")).toBeTruthy();
    expect(mocks.useSectionFetch).toHaveBeenCalledWith(
      "/api/analytics?projectId=project-1",
    );
    expect(mocks.useSectionFetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/api/integration/content-intelligence"),
    );
  });
});
