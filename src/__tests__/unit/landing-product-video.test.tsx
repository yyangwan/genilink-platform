// @vitest-environment jsdom
import React from "react";
import { act, render } from "@testing-library/react";
import { Globe2 } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductShot } from "@/components/landing/landing-page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
}

const activeModule = {
  id: "website",
  image: "/landing/screens/website-analysis.png",
  video: "/landing/videos/landing-website-analysis.webm",
  icon: Globe2,
  label: "网站分析",
  title: "网站分析",
  body: "网站分析",
  metric: "82",
  metricLabel: "官网可理解度",
  rows: [["产品表达", "78", "+12 可提升"]],
  demoMode: "chart",
  focus: { x: "20%", y: "16%", width: "76%", height: "34%" },
};

describe("landing product video playback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
  });

  it("prefers H.264 MP4 before VP9 WebM for desktop compatibility", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    const view = render(<ProductShot active={activeModule} isActive />);
    const sources = [...view.container.querySelectorAll("video source")];

    expect(sources.map((source) => source.getAttribute("type"))).toEqual([
      "video/mp4",
      "video/webm",
    ]);
    expect(sources[0]?.getAttribute("src")).toBe(
      "/landing/videos/landing-website-analysis.mp4",
    );
  });

  it("starts a visible video when the PC window regains focus", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    vi.spyOn(HTMLVideoElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      right: 900,
      bottom: 725,
      left: 0,
      width: 900,
      height: 625,
      toJSON: () => ({}),
    });

    render(<ProductShot active={activeModule} isActive />);
    play.mockClear();

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("recovers playback when browser visibility events are missed", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
    let recoveryFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      recoveryFrame = callback;
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const getRect = vi
      .spyOn(HTMLVideoElement.prototype, "getBoundingClientRect")
      .mockReturnValue({
        x: 0,
        y: 1400,
        top: 1400,
        right: 900,
        bottom: 2025,
        left: 0,
        width: 900,
        height: 625,
        toJSON: () => ({}),
      });

    const view = render(<ProductShot active={activeModule} isActive />);
    play.mockClear();
    getRect.mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      right: 900,
      bottom: 725,
      left: 0,
      width: 900,
      height: 625,
      toJSON: () => ({}),
    });

    await act(async () => {
      recoveryFrame?.(performance.now() + 1000);
    });

    expect(play).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
