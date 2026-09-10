// @vitest-environment jsdom
// 评审 R11：人工重试成功后进度页必须恢复轮询——此前终态后不再安排定时器，
// 重试成功只 setData，页面永远显示旧状态，必须手工刷新。
// 覆盖：failed → 点重试 → POST 成功 → 新世代立即重新 GET（pollNonce 驱动 effect 重启）。

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "wf-1" }),
}));

let currentProjectId = "project-1";
vi.mock("@/components/project/project-context", () => ({
  useProject: () => ({ currentProjectId }),
}));

vi.mock("@/components/ui/toast-context", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import WorkflowPage from "@/app/(dashboard)/content/workflows/[id]/page";

const failedWorkflow = {
  id: "wf-1",
  briefId: "brief-0001",
  briefRevision: 3,
  contentPieceId: null,
  status: "failed",
  platforms: [{ platform: "wechat", status: "failed_retryable", attemptCount: 1 }],
};

const queuedWorkflow = {
  ...failedWorkflow,
  status: "queued",
  platforms: [{ platform: "wechat", status: "queued", attemptCount: 2 }],
};

function jsonResponse(data: unknown, status = 200) {
  return { ok: status < 400, status, json: () => Promise.resolve({ data }) } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  currentProjectId = "project-1";
});

describe("工作流进度页轮询恢复（R11）", () => {
  it("restarts polling after a manual retry succeeds", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (method === "POST") return jsonResponse(queuedWorkflow);
      // GET：第 1 次 failed（终态），重试后的新世代 GET 返回 queued。
      const getCount = calls.filter((c) => c.method === "GET").length;
      return jsonResponse(getCount === 1 ? failedWorkflow : queuedWorkflow);
    });

    const { unmount } = render(<WorkflowPage />);

    // 首次加载到达终态：显示“生成失败”。
    await waitFor(() => {
      expect(screen.getByText("生成失败")).toBeTruthy();
    });

    const beforeGet = calls.filter((c) => c.method === "GET").length;
    // 终态后不再轮询：终态判定在同一次 GET 内完成，此处 beforeGet === 1。

    // 点击重试 → POST 成功 → pollNonce 自增 → effect 重启立即发起新 GET。
    (screen.getByRole("button", { name: /重试/ }) as HTMLElement).click();

    await waitFor(() => {
      const gets = calls.filter((c) => c.method === "GET").length;
      expect(gets).toBeGreaterThan(beforeGet);
    });

    // 新世代拿到 queued 数据，页面状态恢复为“排队中”（不再卡在终态文案）。
    await waitFor(() => {
      expect(screen.getByText("排队中")).toBeTruthy();
    });

    unmount();
  });

  it("keeps showing the terminal state when retry request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (init?.method === "POST") {
        return jsonResponse({ error: { message: "额度不足" } }, 402);
      }
      return jsonResponse(failedWorkflow);
    });

    const { unmount } = render(<WorkflowPage />);
    await waitFor(() => {
      expect(screen.getByText("生成失败")).toBeTruthy();
    });

    (screen.getByRole("button", { name: /重试/ }) as HTMLElement).click();

    // 重试失败：仍停留在终态展示。
    await waitFor(() => {
      expect(screen.getByText("生成失败")).toBeTruthy();
    });
    unmount();
  });
});
