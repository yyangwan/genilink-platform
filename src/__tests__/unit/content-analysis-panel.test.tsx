// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentAnalysisPanel } from "@/components/content/content-analysis-panel";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContentAnalysisPanel", () => {
  it("renders without referencing derived values before initialization", () => {
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
  });
});
