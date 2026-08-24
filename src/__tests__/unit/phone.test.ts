import { describe, expect, it } from 'vitest';
import { displayPhone, normalizePhone } from '@/lib/auth/phone';

describe('phone normalization', () => {
  it.each([
    ['13800138000', '+8613800138000'],
    ['+86 138-0013-8000', '+8613800138000'],
    ['008613800138000', '+8613800138000'],
    ['8613800138000', '+8613800138000'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['', '12800138000', '1380013800', '+8513800138000', 'not-a-phone']) (
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    }
  );

  it('formats an E.164 number for display', () => {
    expect(displayPhone('+8613800138000')).toBe('13800138000');
  });
});
