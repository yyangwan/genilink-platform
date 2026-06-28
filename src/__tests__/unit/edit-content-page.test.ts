import { describe, expect, it } from "vitest";
import { getEditContentProjectError } from "@/app/(dashboard)/content/[id]/edit/page";

describe("getEditContentProjectError", () => {
  it("waits while projects are still loading", () => {
    expect(getEditContentProjectError(true, null)).toBeNull();
  });

  it("prompts the user to select a project when loading is complete but none is selected", () => {
    expect(getEditContentProjectError(false, null)).toBe("请先选择一个项目，再打开内容编辑页");
  });

  it("allows the page to proceed once a project is selected", () => {
    expect(getEditContentProjectError(false, "project-123")).toBeNull();
  });
});
