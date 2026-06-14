import { describe, expect, it } from "vitest";
import { formatDateInTimeZone, getDatePartsInTimeZone } from "@/lib/time";

describe("time helpers", () => {
  it("formats UTC dates in Asia/Shanghai instead of the host timezone", () => {
    expect(formatDateInTimeZone("2026-06-08T01:05:00.000Z", { includeYear: true }))
      .toBe("2026年06月08日 09:05");
  });

  it("keeps day grouping aligned to Asia/Shanghai", () => {
    expect(getDatePartsInTimeZone("2026-06-01T16:30:00.000Z"))
      .toEqual({ year: 2026, month: 6, day: 2, hour: 0, minute: 30 });
  });
});
