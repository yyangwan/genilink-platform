import { describe, expect, it } from "vitest";
import { getCompletedAudits, resolveSelectedAuditId } from "@/lib/visibility/audit-selection";

describe("audit selection", () => {
  const audits = [
    { id: 1, status: "completed", completed_at: "2026-08-01T10:00:00Z" },
    { id: 2, status: "failed", completed_at: "2026-08-02T10:00:00Z" },
    { id: 3, phase: "partial", completed_at: "2026-08-03T10:00:00Z" },
  ];

  it("keeps completed snapshots and sorts the latest first", () => {
    expect(getCompletedAudits({ audits }).map((audit) => audit.id)).toEqual([3, 1]);
  });

  it("uses a valid requested audit and otherwise falls back to the latest", () => {
    const completed = getCompletedAudits(audits);
    expect(resolveSelectedAuditId(completed, "1")).toBe(1);
    expect(resolveSelectedAuditId(completed, "2")).toBe(3);
    expect(resolveSelectedAuditId(completed, null)).toBe(3);
  });
});
