/** Versioned answer-performance rubric. Missing evidence is never a zero. */
export const BRAND_EVALUATION_VERSION = 'brand-visibility-v1';
export const BRAND_EVALUATION_WEIGHTS = { presence: 30, recommendation: 30, position: 20, reasons: 20 } as const;

export interface BrandObservation {
  /** Only neutral category/selection prompts belong to the competitive score. */
  competitive: boolean;
  responseComplete: boolean;
  identityConfirmed: boolean;
  present: boolean | null;
  recommendation: 0 | 1 | 2 | 3 | 4 | null;
  /** Rank is valid only in an explicitly ordered recommendation list. */
  rank: number | null;
  listSize: number | null;
  reasons: 'none' | 'generic' | 'specific' | 'need_matched' | null;
  evidenceIds: string[];
}

export function evaluateBrandObservation(input: BrandObservation) {
  const empty = { presence: null, recommendation: null, position: null, reasons: null };
  if (!input.competitive) return { version: BRAND_EVALUATION_VERSION, status: 'excluded' as const, score: null, dimensions: empty };
  if (!input.responseComplete || !input.identityConfirmed || input.present === null) {
    return { version: BRAND_EVALUATION_VERSION, status: 'pending' as const, score: null, dimensions: empty };
  }
  // A confirmed absence in a fully analyzed answer is a measured zero.
  if (!input.present) return { version: BRAND_EVALUATION_VERSION, status: 'complete' as const, score: 0,
    dimensions: { presence: 0, recommendation: 0, position: 0, reasons: 0 } };
  if (!input.evidenceIds.length) return { version: BRAND_EVALUATION_VERSION, status: 'pending' as const, score: null, dimensions: empty };
  const validRank = Number.isInteger(input.rank) && Number.isInteger(input.listSize) &&
    input.rank! >= 1 && input.listSize! >= input.rank!;
  const dimensions = {
    presence: 100,
    recommendation: input.recommendation === null ? null : input.recommendation * 25,
    position: !validRank ? null : input.listSize === 1 ? 100 : 100 * (input.listSize! - input.rank!) / (input.listSize! - 1),
    reasons: input.reasons === null ? null : ({ none: 0, generic: 25, specific: 75, need_matched: 100 })[input.reasons],
  };
  const complete = Object.values(dimensions).every(value => value !== null);
  const score = complete ? Math.round((Object.keys(BRAND_EVALUATION_WEIGHTS) as Array<keyof typeof dimensions>)
    .reduce((sum, key) => sum + dimensions[key]! * BRAND_EVALUATION_WEIGHTS[key] / 100, 0)) : null;
  return { version: BRAND_EVALUATION_VERSION, status: complete ? 'complete' as const : 'partial' as const, score, dimensions };
}
