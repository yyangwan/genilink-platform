import { describe, expect, it } from "vitest";
import { analyzeSeoContent } from "@/components/content/content-analysis";
import { buildContentAnalysisUrl } from "@/components/content/content-analysis-panel";

describe("analyzeSeoContent", () => {
  it("flags short content and missing headings", () => {
    const result = analyzeSeoContent("<p>hello world</p>", "hello");

    expect(result.characterCount).toBeGreaterThan(0);
    expect(result.hasH1).toBe(false);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.some((item) => item.includes("H1"))).toBe(true);
    expect(result.overallScore).toBeLessThan(80);
  });

  it("detects keyword density and heading hierarchy", () => {
    const html = "<h1>SEO 鏍囬</h1><h2>瀛愭爣棰?/h2><p>SEO 鍐呭 SEO 鍐呭</p>";
    const result = analyzeSeoContent(html, "SEO");

    expect(result.hasH1).toBe(true);
    expect(result.headingCount).toBe(2);
    expect(result.keywordDensity[0]?.count).toBeGreaterThan(0);
    expect(result.keywordInTitle).toBe(true);
  });

  it("builds analysis URLs with projectId so auth guards can validate the request", () => {
    expect(buildContentAnalysisUrl("content-1", "quality/local", "project-123", { platform: "wechat" })).toBe(
      "/api/content/content-1/quality/local?projectId=project-123&platform=wechat",
    );
    expect(buildContentAnalysisUrl("content-1", "optimize", "project-123")).toBe(
      "/api/content/content-1/optimize?projectId=project-123",
    );
    expect(buildContentAnalysisUrl("content-1", "quality", "project-123")).toBe(
      "/api/content/content-1/quality?projectId=project-123",
    );
  });
});
