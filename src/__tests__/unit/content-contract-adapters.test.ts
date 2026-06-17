import { describe, expect, it } from 'vitest';
import {
  normalizeAnalyticsData,
  normalizeBrandVoice,
  normalizePlatformConfig,
  normalizeTemplate,
  toUpstreamBrandVoicePayload,
  toUpstreamTemplatePayload,
  unwrapGenieSourceCreate,
  unwrapGenieGenerations,
  unwrapGenieSources,
} from '@/lib/content/contract-adapters';

describe('content contract adapters', () => {
  it('normalizes upstream brand voice fields for the Genilink UI', () => {
    expect(normalizeBrandVoice({
      id: 'voice-1',
      name: 'Professional',
      guidelines: 'clear, concise',
      samples: JSON.stringify(['sample copy']),
    })).toMatchObject({
      id: 'voice-1',
      sampleContent: 'sample copy',
      toneKeywords: ['clear', 'concise'],
    });
  });

  it('converts UI brand voice payloads to upstream fields', () => {
    expect(toUpstreamBrandVoicePayload({
      name: 'Professional',
      toneKeywords: ['clear', 'concise'],
      sampleContent: 'sample copy',
    })).toMatchObject({
      guidelines: 'clear, concise',
      samples: ['sample copy'],
    });
  });

  it('normalizes upstream template fields for the Genilink UI', () => {
    expect(normalizeTemplate({
      id: 'tpl-1',
      name: 'Template',
      template: 'Hello {{name}}',
      variables: JSON.stringify([{ name: 'name', type: 'text' }]),
    })).toMatchObject({
      id: 'tpl-1',
      content: 'Hello {{name}}',
      variables: ['name'],
    });
  });

  it('converts UI template variables to upstream variable objects', () => {
    expect(toUpstreamTemplatePayload({
      content: 'Hello {{品牌名}}',
      variables: ['品牌名', 'product_name'],
    })).toMatchObject({
      template: 'Hello {{品牌名}}',
      variables: [
        { name: 'var_1', type: 'text', description: '品牌名', required: false },
        { name: 'product_name', type: 'text', description: 'product_name', required: false },
      ],
    });
  });

  it('unwraps Genie source and generation envelopes', () => {
    expect(unwrapGenieSources({ sources: [{ id: 'source-1' }] })).toEqual([{ id: 'source-1' }]);
    expect(unwrapGenieSourceCreate({ source: { id: 'source-2' }, analysis: { ok: true } })).toEqual({ id: 'source-2' });
    expect(unwrapGenieGenerations({ drafts: [{ id: 'draft-1' }] })).toEqual([
      { id: 'draft-1', status: 'completed' },
    ]);
  });

  it('marks platform configs connected only when credentials exist and config is enabled', () => {
    expect(normalizePlatformConfig({ config: null }, 'wechat')).toMatchObject({
      platform: 'wechat',
      connected: false,
    });
    expect(normalizePlatformConfig({ config: { platform: 'wechat', enabled: true, hasAccessToken: true } }, 'wechat')).toMatchObject({
      platform: 'wechat',
      connected: true,
    });
  });

  it('normalizes analytics payloads from either the legacy flat shape or the newer summary shape', () => {
    expect(normalizeAnalyticsData({
      summary: {
        totalContent: 12,
        publishedCount: 5,
        avgQualityScore: 78,
      },
      distributions: {
        byStatus: { draft: 2, published: 3 },
        byPlatform: { wechat: 4, weibo: 1 },
      },
      topProjects: [
        { id: 'p1', name: 'Project One', contentCount: 4 },
      ],
      recentActivity: [
        { id: 'c1', title: 'Post', status: 'published', projectName: 'Project One', createdAt: '2026-06-01T00:00:00Z' },
      ],
    })).toMatchObject({
      totalContent: 12,
      publishedCount: 5,
      avgQuality: 78,
      platformBreakdown: [
        { platform: 'wechat', count: 4 },
        { platform: 'weibo', count: 1 },
      ],
      statusBreakdown: [
        { status: 'draft', count: 2 },
        { status: 'published', count: 3 },
      ],
      topPerforming: [
        { id: 'p1', title: 'Project One', score: 4 },
      ],
      recentActivity: [
        { date: '2026-06-01T00:00:00Z', count: 1 },
      ],
    });
  });
});
