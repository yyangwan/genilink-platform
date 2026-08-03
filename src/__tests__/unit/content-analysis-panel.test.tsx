// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ContentAnalysisPanel } from "@/components/content/content-analysis-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContentAnalysisPanel", () => {
  it("renders and automatically requests local analysis for the active identity", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => {}),
    );

    render(
      <ContentAnalysisPanel
        contentPieceId="content-1"
        projectId="project-1"
        content="<h1>Title</h1><p>Body content for analysis.</p>"
        platform="xiaohongshu"
      />,
    );

    expect(screen.getByText("内容分析")).toBeTruthy();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/content/content-1/quality/local?projectId=project-1&platform=xiaohongshu",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });
});
