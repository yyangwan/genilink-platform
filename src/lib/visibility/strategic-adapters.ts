import type {
  AnswerStructureEvolution,
  CompetitorPosition,
  CompetitorPositioning,
  SourceAuthorityPoint,
  SourceAuthorityTrends,
  StructureEvolutionPoint,
} from "@/types/visibility";

const pct = (value: number | null | undefined) => Math.round((value ?? 0) * 100);

export function toSourceAuthorityPoints(data: SourceAuthorityTrends | null): SourceAuthorityPoint[] {
  if (!data) return [];

  return data.audits.map((audit) => ({
    date: audit.date,
    sources: data.domain_trends
      .map((trend) => {
        const point = trend.data.find((item) => item.audit_id === audit.audit_id);
        if (!point) return null;
        return {
          source: trend.domain,
          authority: Math.round(point.authority_avg),
        };
      })
      .filter((source): source is { source: string; authority: number } => source !== null),
  }));
}

export function toCompetitorPositions(data: CompetitorPositioning | null): CompetitorPosition[] {
  if (!data) return [];

  return data.brands.map((brand) => ({
    brand: brand.name,
    score: pct(brand.sentiment_positive_rate),
    visibility: pct(brand.mention_frequency),
    is_own: !brand.is_competitor,
  }));
}

export function toStructureEvolutionPoints(data: AnswerStructureEvolution | null): StructureEvolutionPoint[] {
  if (!data) return [];

  return data.audits.map((audit) => {
    const pctFor = (...keys: string[]) =>
      Math.round(
        keys.reduce((sum, key) => {
          const point = data.structure_distribution[key]?.find((item) => item.audit_id === audit.audit_id);
          return sum + (point?.pct ?? 0);
        }, 0),
      );

    return {
      period: audit.date,
      structured: pctFor("list", "comparison"),
      semi_structured: pctFor("qa"),
      unstructured: pctFor("narrative", "unknown"),
    };
  });
}
