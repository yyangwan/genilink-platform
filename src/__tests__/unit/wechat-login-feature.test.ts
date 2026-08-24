import { describe, expect, it } from "vitest";
import { isWechatLoginEnabled } from "@/lib/auth/wechat-login-feature";

describe("isWechatLoginEnabled", () => {
  it.each([
    ["true", true],
    ["false", false],
    [undefined, false],
  ])("maps %s to %s", (value, expected) => {
    expect(isWechatLoginEnabled(value)).toBe(expected);
  });
});
