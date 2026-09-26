import { describe, expect, it } from 'vitest';
import { buildLoginCallbackPath, getSafeCallbackPath } from '@/lib/auth/safe-callback';

describe('safe login callbacks', () => {
  const origin = 'https://genilink.cn';

  it.each([
    ['//evil.example/path', '/dashboard'],
    ['https://evil.example/path', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    ['/safe\\evil', '/dashboard'],
    ['/safe\npath', '/dashboard'],
    ['/start?intent=1', '/start?intent=1'],
    ['https://genilink.cn/start?intent=1#progress', '/start?intent=1#progress'],
  ])('normalizes %s to %s', (candidate, expected) => {
    expect(getSafeCallbackPath(candidate, origin)).toBe(expected);
  });

  it('rejects oversized callbacks', () => {
    expect(getSafeCallbackPath(`/${'a'.repeat(2048)}`, origin)).toBe('/dashboard');
  });

  it('preserves query strings for proxy redirects', () => {
    expect(buildLoginCallbackPath('/start', '?source=landing&plan=pro')).toBe('/start?source=landing&plan=pro');
  });

  it('drops an oversized query rather than truncating it', () => {
    expect(buildLoginCallbackPath('/start', `?value=${'a'.repeat(3000)}`)).toBe('/start');
  });
});
