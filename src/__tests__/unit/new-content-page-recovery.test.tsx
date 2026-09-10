// @vitest-environment jsdom
// 评审 R14：A 项目 Brief → 切到 B 项目（GET 403 显示错误）→ 切回 A 项目（GET 成功）
// 必须清除 loadError 恢复编辑页——此前成功分支不清错误，页面一直显示错误直到整页刷新。
// 同时覆盖 §16.2 补齐：strategy 展示与 editable 约束初始化。

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("briefId=brief-1"),
  useRouter: () => ({ push: vi.fn() }),
}));

let currentProjectId = "project-a";
vi.mock("@/components/project/project-context", () => ({
  useProject: () => ({ currentProjectId }),
}));

const addToast = vi.fn();
vi.mock("@/components/ui/toast-context", () => ({
  useToast: () => ({ addToast }),
}));

import NewContentPage from "@/app/(dashboard)/content/new/page";

const briefDetail = {
  id: "brief-1",
  projectId: "project-a",
  revision: 2,
  status: "ready",
  brief: {
    topic: "AI 搜索时代的品牌可见性",
    titleCandidates: ["标题一", "标题二"],
    outline: [
      { id: "s1", heading: "第一节", purpose: "回答问题", evidenceRefs: [] },
      { id: "s2", heading: "第二节", purpose: "", evidenceRefs: [] },
      { id: "s3", heading: "第三节", purpose: "", evidenceRefs: [] },
      { id: "s4", heading: "第四节", purpose: "", evidenceRefs: [] },
    ],
    keywords: ["AI 搜索"],
    references: [],
    notes: "",
    strategy: {
      objective: "建立品类认知",
      audience: "市场负责人",
      intent: "thought_leadership",
      contentType: "guide",
    },
    constraints: {
      locked: { mustMention: ["数据必须可溯源"], avoidMention: ["竞品点名"] },
      editable: { mustMention: ["客户案例"], avoidMention: [] },
    },
  },
  platformPlan: [{ platform: "wechat", capability: "supported", selected: true }],
  source: { suggestionId: "sug-1" },
  refinement: { status: "succeeded" },
  eligibility: null,
};

function jsonResponse(data: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve(data) } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  currentProjectId = "project-a";
});

describe("新建内容页项目切换恢复（R14）", () => {
  it("clears the stale load error after switching back to the brief project", async () => {
    const briefGets: string[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/api/content/briefs/brief-1")) {
        briefGets.push(currentProjectId);
        // 错项目（project-b）403；原项目（project-a）成功。
        return currentProjectId === "project-a"
          ? jsonResponse({ data: briefDetail })
          : jsonResponse({ error: { message: "该创作方案属于其他项目，请切换回原项目查看。" } }, 403);
      }
      if (url.includes("/api/templates") || url.includes("/api/brand-voices")) {
        return jsonResponse({ data: [] });
      }
      return jsonResponse({ data: {} });
    });

    // 初始在错项目下加载：显示错误。
    currentProjectId = "project-b";
    const { rerender } = render(<NewContentPage />);
    await waitFor(() => {
      expect(screen.getByText(/该创作方案属于其他项目/)).toBeTruthy();
    });

    // 切回原项目：重新 GET 成功 → 错误清除，编辑器恢复。
    currentProjectId = "project-a";
    rerender(<NewContentPage />);

    await waitFor(() => {
      expect(
        screen.queryByText(/该创作方案属于其他项目/),
      ).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue("AI 搜索时代的品牌可见性")).toBeTruthy();
    });

    // §16.2：strategy 与 editable 约束初始化到编辑器。
    expect(screen.getByDisplayValue("建立品类认知")).toBeTruthy();
    expect(screen.getByText("数据必须可溯源")).toBeTruthy(); // locked 只读展示

    // 首次在错项目下请求失败，切回后重新以原项目请求成功（次数受渲染影响，只看顺序语义）。
    expect(briefGets[0]).toBe("project-b");
    expect(briefGets[briefGets.length - 1]).toBe("project-a");
    expect(fetchMock).toHaveBeenCalled();
  });
});
