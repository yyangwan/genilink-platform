// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiPlatformLabel } from "@/components/ui/ai-platform-label";
import { getAiPlatformLabel, getAiPlatformMeta } from "@/lib/ai-platforms";

describe("AI platform presentation", () => {
  it.each([
    ["deepseek", "DeepSeek"],
    ["通义", "通义千问"],
    ["qwen", "通义千问"],
    ["hunyuan", "腾讯元宝"],
    ["yuanbao", "腾讯元宝"],
    ["openai", "ChatGPT"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(getAiPlatformLabel(input)).toBe(expected);
  });

  it("preserves an unknown platform name with a fallback icon", () => {
    expect(getAiPlatformMeta("New AI")).toMatchObject({ label: "New AI", glyph: "N" });
  });

  it("uses a local official asset for an active audit platform", () => {
    expect(getAiPlatformMeta("hunyuan").iconPath).toBe("/platform-icons/yuanbao.png");
  });

  it("renders the canonical name with the official platform icon", () => {
    const { container } = render(<AiPlatformLabel platform="qwen" />);

    expect(screen.getByText("通义千问")).toBeTruthy();
    const icon = container.querySelector<HTMLElement>('[aria-hidden="true"] span');
    expect(icon?.style.backgroundImage).toContain("/platform-icons/qwen.png");
  });
});
