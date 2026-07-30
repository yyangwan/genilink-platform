import { describe, expect, it, vi } from "vitest";
import {
  configurePostgresUtcTimestamps,
  parsePostgresUtcTimestamp,
} from "@/lib/database-time";

describe("PostgreSQL UTC timestamp handling", () => {
  it("interprets timestamp-without-time-zone values as UTC", () => {
    expect(parsePostgresUtcTimestamp("2026-07-29 23:50:25.123").toISOString())
      .toBe("2026-07-29T23:50:25.123Z");
  });

  it("registers the parser for PostgreSQL OID 1114", () => {
    const setTypeParser = vi.fn();

    configurePostgresUtcTimestamps({ setTypeParser });

    expect(setTypeParser).toHaveBeenCalledWith(1114, parsePostgresUtcTimestamp);
  });
});
