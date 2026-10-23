import { describe, expect, it } from 'vitest';
import { evaluateBrandObservation, type BrandObservation } from '@/lib/visibility/brand-evaluation';

const observation: BrandObservation = { competitive: true, responseComplete: true, identityConfirmed: true,
  present: true, recommendation: 4, rank: 1, listSize: 3, reasons: 'need_matched', evidenceIds: ['quote-1'] };

describe('fixed brand evaluation rubric', () => {
  it('scores a fully supported leading recommendation at 100', () => {
    expect(evaluateBrandObservation(observation).score).toBe(100);
  });
  it('uses fixed weights rather than sentiment', () => {
    expect(evaluateBrandObservation({ ...observation, recommendation: 2, rank: 2, reasons: 'generic' }).score).toBe(60);
  });
  it('does not turn failed analysis into absence', () => {
    expect(evaluateBrandObservation({ ...observation, present: false, responseComplete: false }).score).toBeNull();
    expect(evaluateBrandObservation({ ...observation, present: false }).score).toBe(0);
  });
  it('does not invent ranking or redistribute missing weights', () => {
    expect(evaluateBrandObservation({ ...observation, rank: null, listSize: null })).toMatchObject({ status: 'partial', score: null });
    expect(evaluateBrandObservation({ ...observation, rank: 4, listSize: 3 }).score).toBeNull();
  });
  it('excludes brand-led questions and requires attribution evidence', () => {
    expect(evaluateBrandObservation({ ...observation, competitive: false }).status).toBe('excluded');
    expect(evaluateBrandObservation({ ...observation, identityConfirmed: false }).score).toBeNull();
    expect(evaluateBrandObservation({ ...observation, evidenceIds: [] }).score).toBeNull();
  });
});
