import { describe, expect, it } from "vitest";
import {
  formatDateInTimeZone,
  formatShanghaiDateTimeInput,
  getDatePartsInTimeZone,
  parseShanghaiDateTimeInput,
} from "@/lib/time";

describe("time helpers", () => {
  it("treats timezone-less API timestamps as UTC", () => {
    expect(formatDateInTimeZone("2026-07-29T23:50:25", { includeYear: true }))
      .toBe("2026年07月30日 07:50");
  });

  it("formats UTC dates in Asia/Shanghai instead of the host timezone", () => {
    expect(formatDateInTimeZone("2026-06-08T01:05:00.000Z", { includeYear: true }))
      .toBe("2026年06月08日 09:05");
  });

  it("keeps day grouping aligned to Asia/Shanghai", () => {
    expect(getDatePartsInTimeZone("2026-06-01T16:30:00.000Z"))
      .toEqual({ year: 2026, month: 6, day: 2, hour: 0, minute: 30 });
  });

  it("round-trips datetime-local values as Asia/Shanghai", () => {
    const utc = parseShanghaiDateTimeInput("2026-07-30T07:50");

    expect(utc?.toISOString()).toBe("2026-07-29T23:50:00.000Z");
    expect(formatShanghaiDateTimeInput(utc!)).toBe("2026-07-30T07:50");
  });
});
