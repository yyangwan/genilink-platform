import { describe, expect, it } from "vitest";
import { getAnswerStructureLabel } from "@/lib/visibility/answer-structure";

describe("getAnswerStructureLabel", () => {
  it.each([
    ["list", "列表式"],
    ["comparison", "对比式"],
    ["narrative", "叙述式"],
    ["qa", "问答式"],
    ["unknown", "其他"],
  ])("translates %s to %s", (value, expected) => {
    expect(getAnswerStructureLabel(value)).toBe(expected);
  });

  it("normalizes casing and keeps unrecognized values visible", () => {
    expect(getAnswerStructureLabel(" LIST ")).toBe("列表式");
    expect(getAnswerStructureLabel("custom")).toBe("custom");
  });
});
