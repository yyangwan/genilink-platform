// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ActionIntro, CitationOverview, CitationViewNav, EntityComparison, PlatformComparison, SourceLibrary } from "@/components/visibility/citation-prototype-views";
import type { EvidenceRun } from "@/types/intelligence";

afterEach(cleanup);

const run = {
  id: "run-1", audit_id: "1", revision: 2, status: "partial", created_at: "2026-10-20T00:00:00Z",
  coverage: { responses: 2, failed_responses: 1, sources: 3, captured_sources: 1, total_characters: 1000, analyzed_characters: 0 },
  responses: [
    { id: "answer-a", platform: "deepseek", prompt: "同一个问题", prompt_hash: "p1", observed_at: "", error: false },
    { id: "answer-b", platform: "qwen", prompt: "同一个问题", prompt_hash: "p1", observed_at: "", error: false },
    { id: "answer-c", platform: "qwen", prompt: "另一问题", prompt_hash: "p2", observed_at: "", error: false },
  ],
  sources: [
    { id: "s1", response_id: "answer-a", platform: "deepseek", title: "案例文章", url: "https://example.com/a", kind: "answer_reference", snippet: "", document_id: "d1", snapshot_id: "v1", fetch_status: "captured" },
    { id: "s2", response_id: "answer-b", platform: "qwen", title: "案例文章", url: "https://example.com/a", kind: "answer_reference", snippet: "", document_id: "d1", snapshot_id: "v1", fetch_status: "captured" },
    { id: "s3", response_id: "answer-c", platform: "qwen", title: "无地址文章", url: null, kind: "answer_reference", snippet: "", document_id: null, snapshot_id: null, fetch_status: "pending" },
  ],
  summary: {
    entities: [], claim_evidence: [], mentions: [], claims: [],
    platforms: [
      { platform: "deepseek", responses: 1, analyzed_responses: 0, source_observations: 1, snapshot_count: 1 },
      { platform: "qwen", responses: 2, analyzed_responses: 0, source_observations: 2, snapshot_count: 1 },
    ],
    diagnoses: [
      { record_id: "diag-a", platform: "deepseek", prompt: "同一个问题", finding: "仅 DeepSeek 的发现", action: { status: "proposed", task: "核对案例材料", materials_needed: [], success_check: "复测" } },
      { record_id: "diag-b", platform: "qwen", prompt: "同一个问题", finding: "仅千问的发现", action: { status: "proposed", task: "核对参数", materials_needed: [], success_check: "复测" } },
    ],
  },
} as EvidenceRun;

describe("confirmed eight-page citation prototype navigation", () => {
  it("shows all eight decision steps instead of the former analytics menu", () => {
    render(<CitationViewNav value="overview" onChange={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(8);
    expect(screen.getByRole("button", { name: /来源文章库/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /行动效果复测/ })).toBeTruthy();
  });

  it("does not turn zero analyzed characters into a brand action", () => {
    render(<CitationOverview run={run} onView={vi.fn()} />);
    expect(screen.getByText("当前最需要处理的 3 项数据缺口")).toBeTruthy();
    expect(screen.getByText("核对文本分析失败")).toBeTruthy();
    expect(screen.queryByText("核对案例材料")).toBeNull();
  });

  it("keeps diagnoses separate for the same prompt on each platform", () => {
    render(<PlatformComparison run={{ ...run, coverage: { ...run.coverage, analyzed_characters: 1000 },
      summary: { ...run.summary, platforms: run.summary.platforms?.map(item => ({ ...item, analyzed_responses: 1 })) } }} onOpenAnswer={vi.fn()} onView={vi.fn()} />);
    const cards = document.querySelectorAll(".citation-platform-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0] as HTMLElement).getByText("核对案例材料")).toBeTruthy();
    expect(within(cards[1] as HTMLElement).getByText("核对参数")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("对照提示词"), { target: { value: "p2" } });
    expect(document.querySelectorAll(".citation-platform-card")).toHaveLength(1);
  });

  it("requires a project scope before reading per-observation source data", () => {
    render(<SourceLibrary run={run} onOpenAnswer={vi.fn()} onOpenSource={vi.fn()} onRetry={vi.fn()} retrying={null} />);
    expect(screen.getByRole("status").textContent).toContain("请先选择工作空间");
    expect(document.querySelectorAll(".citation-source-entry")).toHaveLength(0);
  });

  it("keeps newly discovered brands visible while their identity is unconfirmed", () => {
    const candidate = { id: "new-brand", name: "新发现品牌", kind: "brand", role: "unregistered",
      identity_status: "provisional", response_count: 1, source_mentions: 2, platform_response_counts: { qwen: 1 } };
    render(<EntityComparison run={{ ...run, summary: { ...run.summary, entities: [candidate] } }} onReview={vi.fn()} />);
    expect(screen.getByText("新发现品牌")).toBeTruthy();
    expect(screen.getByText("候选主体")).toBeTruthy();
    expect(screen.getByText("待核对")).toBeTruthy();
    expect(screen.getByText(/不能相加作为回答总数/)).toBeTruthy();
  });

  it("withholds optimization actions until analyzed text is available", () => {
    render(<ActionIntro run={run} onView={vi.fn()} />);
    expect(screen.queryByText("核对案例材料")).toBeNull();
    expect(screen.getByText(/当前没有可依据的品牌优化行动/)).toBeTruthy();
  });
});
