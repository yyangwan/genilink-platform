// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuditSnapshotSelector } from "@/components/audits/audit-snapshot-selector";

describe("AuditSnapshotSelector", () => {
  it("renders the audit menu with visible hover and focus affordances", () => {
    render(
      <AuditSnapshotSelector
        audits={[{ id: 12, status: "completed", completed_at: "2026-08-20T00:00:00Z" }]}
        selectedAuditId={12}
        latestAuditId={12}
        projectId="project-1"
        onChange={vi.fn()}
      />,
    );

    const select = screen.getByLabelText("选择审计报告");

    expect(screen.queryByText("选择审计报告")).toBeNull();
    expect(select.className).toContain("cursor-pointer");
    expect(select.className).toContain("hover:border-[var(--color-primary)]");
    expect(select.className).toContain("hover:bg-[var(--bg-hover)]");
    expect(select.className).toContain("focus-visible:ring-2");
    expect((select as HTMLElement).style.background).toBe("");
    expect((select as HTMLElement).style.border).toBe("");
  });
});
