import { describe, expect, it } from "vitest";
import { analyzeSeoContent } from "@/components/content/content-analysis";

describe("analyzeSeoContent", () => {
  it("flags short content and missing headings", () => {
    const result = analyzeSeoContent("<p>hello world</p>", "hello");

    expect(result.characterCount).toBeGreaterThan(0);
    expect(result.hasH1).toBe(false);
    expect(result.suggestions.some((item) => item.includes("缺少 H1"))).toBe(true);
    expect(result.overallScore).toBeLessThan(80);
  });

  it("detects keyword density and heading hierarchy", () => {
    const html = "<h1>SEO 标题</h1><h2>子标题</h2><p>SEO 内容 SEO 内容</p>";
    const result = analyzeSeoContent(html, "SEO");

    expect(result.hasH1).toBe(true);
    expect(result.headingCount).toBe(2);
    expect(result.keywordDensity[0]?.count).toBeGreaterThan(0);
    expect(result.keywordInTitle).toBe(true);
  });
});
