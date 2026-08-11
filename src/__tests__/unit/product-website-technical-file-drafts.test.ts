import { describe, expect, it } from 'vitest';

import { buildProductWebsiteTechnicalFileDrafts } from '@/lib/product-website/technical-file-drafts';

describe('buildProductWebsiteTechnicalFileDrafts', () => {
  it('generates reviewable drafts only for files confirmed missing by the audit', () => {
    const drafts = buildProductWebsiteTechnicalFileDrafts({
      targetUrl: 'https://example.com/products/widget',
      canonical: 'https://example.com/products/widget',
      title: 'Example Widget',
      description: 'A concise product description.',
      technicalAudit: {
        robots: { found: false },
        llms: { found: false },
        llmsFull: { found: true },
      },
    });

    expect(drafts.map((draft) => draft.filename)).toEqual(['robots.txt', 'llms.txt']);
    expect(drafts[0]?.content).toContain('Sitemap: https://example.com/sitemap.xml');
    expect(drafts[0]?.content).toContain('review before publishing');
    expect(drafts[1]?.content).toContain('# Example Widget');
    expect(drafts[1]?.content).toContain('> A concise product description.');
    expect(drafts[1]?.content).toContain('[网站首页](https://example.com)');
    expect(drafts[1]?.content).toContain('TODO');
  });

  it('does not infer missing files when an audit field is unavailable', () => {
    expect(buildProductWebsiteTechnicalFileDrafts({
      targetUrl: 'https://example.com',
      technicalAudit: { robots: { found: true } },
    })).toEqual([]);
  });

  it('returns no drafts for an invalid target URL', () => {
    expect(buildProductWebsiteTechnicalFileDrafts({
      targetUrl: 'not-a-url',
      technicalAudit: { robots: { found: false } },
    })).toEqual([]);
  });
});
