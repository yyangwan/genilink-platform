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
});
