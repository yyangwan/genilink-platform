import { describe, expect, it } from 'vitest';
import {
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
});
