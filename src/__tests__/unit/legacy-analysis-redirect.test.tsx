// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams("project=p1&auditId=12&runId=run12"),
}));

import SuggestionsPage from "@/app/(dashboard)/suggestions/page";
import TrendsPage from "@/app/(dashboard)/trends/page";
import ComparePage from "@/app/(dashboard)/compare/page";
import InsightsPage from "@/app/(dashboard)/insights/page";
import StrategicPage from "@/app/(dashboard)/strategic/page";

afterEach(() => { cleanup(); replace.mockClear(); });

describe("former analysis URLs", () => {
  it.each([
    [SuggestionsPage, "actions"], [TrendsPage, "measurements"], [ComparePage, "entities"],
    [InsightsPage, "sources"], [StrategicPage, "overview"],
  ])("opens the matching prototype view while retaining the selected audit", (Page, view) => {
    render(<Page />);
    expect(replace).toHaveBeenCalledWith("/intelligence?project=p1&auditId=12&runId=run12&view=" + view);
  });
});
