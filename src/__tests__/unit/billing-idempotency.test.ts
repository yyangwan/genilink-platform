import { describe, expect, it } from 'vitest';
import {
  requestHash,
  resolveIdempotency,
  stableStringify,
} from '@/lib/billing/idempotency';

describe('stableStringify', () => {
  it('is independent of key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(stableStringify({ a: 1, b: { c: 3, d: 4 } })).toBe(stableStringify({ b: { d: 4, c: 3 }, a: 1 }));
  });

  it('handles nested arrays and primitives', () => {
    expect(stableStringify([1, { z: 1, a: 2 }, null])).toBe('[1,{"a":2,"z":1},null]');
    expect(stableStringify('x')).toBe('"x"');
    expect(stableStringify(null)).toBe('null');
  });

  it('drops undefined values like JSON.stringify', () => {
    expect(stableStringify({ a: undefined, b: 1 })).toBe('{"b":1}');
  });
});

describe('requestHash (spec §8)', () => {
  it('produces identical hashes for reordered bodies', () => {
    expect(requestHash({ planKey: 'p', couponCode: null })).toBe(requestHash({ couponCode: null, planKey: 'p' }));
  });

  it('produces different hashes for different bodies', () => {
    expect(requestHash({ planKey: 'a' })).not.toBe(requestHash({ planKey: 'b' }));
  });
});

describe('resolveIdempotency (spec §8: replay vs conflict)', () => {
  it('new when no stored key exists', () => {
    expect(resolveIdempotency({ existingKey: null, existingHash: null, key: 'k1', hash: 'h1' })).toEqual({ type: 'new' });
  });

  it('replay when key and hash both match', () => {
    expect(resolveIdempotency({ existingKey: 'k1', existingHash: 'h1', key: 'k1', hash: 'h1' })).toEqual({ type: 'replay' });
  });

  it('conflict (409 IDEMPOTENCY_KEY_REUSED) when the key matches but the body differs', () => {
    expect(resolveIdempotency({ existingKey: 'k1', existingHash: 'h1', key: 'k1', hash: 'h2' })).toEqual({ type: 'conflict' });
  });
});
