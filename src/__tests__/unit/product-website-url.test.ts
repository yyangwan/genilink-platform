import { describe, expect, it } from 'vitest';
import { normalizeProductWebsiteUrl } from '@/lib/product-website/url';

describe('normalizeProductWebsiteUrl', () => {
  it('adds https to bare domains and strips fragments', () => {
    expect(normalizeProductWebsiteUrl('example.com/product#section')).toEqual({
      ok: true,
      url: 'https://example.com/product',
      hostname: 'example.com',
    });
  });

  it('rejects unsupported protocols', () => {
    expect(normalizeProductWebsiteUrl('file:///etc/passwd')).toEqual({
      ok: false,
      error: 'Only http and https URLs are supported',
    });
  });

  it('rejects localhost and private IP literals', () => {
    expect(normalizeProductWebsiteUrl('http://localhost:3000')).toEqual({
      ok: false,
      error: 'Target URL is not allowed',
    });
    expect(normalizeProductWebsiteUrl('http://192.168.1.10')).toEqual({
      ok: false,
      error: 'Target URL is not allowed',
    });
  });

  it.each([
    'http://100.64.0.1',
    'http://192.0.2.1',
    'http://198.18.0.1',
    'http://198.51.100.1',
    'http://203.0.113.1',
    'http://224.0.0.1',
    'http://[::1]',
    'http://[fe80::1]',
    'http://[2001:db8::1]',
  ])('rejects non-public address %s', (value) => {
    expect(normalizeProductWebsiteUrl(value)).toEqual({
      ok: false,
      error: 'Target URL is not allowed',
    });
  });

  it('rejects credentials and non-standard ports', () => {
    expect(normalizeProductWebsiteUrl('https://user:pass@example.com')).toEqual({
      ok: false,
      error: 'Credentials in target URL are not allowed',
    });
    expect(normalizeProductWebsiteUrl('https://example.com:8443')).toEqual({
      ok: false,
      error: 'Target URL port is not allowed',
    });
  });
});
