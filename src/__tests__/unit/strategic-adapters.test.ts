import { describe, expect, it } from "vitest";
import {
  toCompetitorPositions,
  toSourceAuthorityPoints,
  toStructureEvolutionPoints,
} from "@/lib/visibility/strategic-adapters";

describe("strategic adapters", () => {
  it("maps source authority object responses into chart rows", () => {
    expect(
      toSourceAuthorityPoints({
        audits: [{ audit_id: 1, date: "2026-06-01", total_sources: 2 }],
        domain_trends: [
          { domain: "example.com", data: [{ audit_id: 1, count: 3, authority_avg: 77.6 }] },
          { domain: "missing.com", data: [{ audit_id: 2, count: 1, authority_avg: 12 }] },
        ],
        platform_preferences: [],
        authority_trend: {},
      }),
    ).toEqual([
      {
        date: "2026-06-01",
        sources: [{ source: "example.com", authority: 78 }],
      },
    ]);
  });

  it("maps competitor positioning object responses into chart rows", () => {
    expect(
      toCompetitorPositions({
        brands: [
          {
            name: "Own",
            is_competitor: false,
            mention_frequency: 0.42,
            sentiment_positive_rate: 0.81,
            avg_authority: 3,
            mention_count: 7,
            trajectory: [],
          },
        ],
        quadrant_labels: {},
      }),
    ).toEqual([{ brand: "Own", score: 81, visibility: 42, is_own: true }]);
  });

  it("maps backend structure buckets into the current three-column chart shape", () => {
    expect(
      toStructureEvolutionPoints({
        audits: [{ audit_id: 1, date: "2026-06-01" }],
        structure_distribution: {
          list: [{ audit_id: 1, count: 3, pct: 30 }],
          comparison: [{ audit_id: 1, count: 2, pct: 20 }],
          qa: [{ audit_id: 1, count: 1, pct: 10 }],
          narrative: [{ audit_id: 1, count: 4, pct: 40 }],
        },
        platform_structure: {},
        correlation: {},
        transitions: [],
      }),
    ).toEqual([
      {
        period: "2026-06-01",
        structured: 50,
        semi_structured: 10,
        unstructured: 40,
      },
    ]);
  });
});
