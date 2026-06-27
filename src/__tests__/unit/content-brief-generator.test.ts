import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateContentBriefFromSuggestion } from '@/lib/content/brief-generator';

const project = {
  id: 'project-1',
  name: 'Project A',
  url: 'https://brand.com',
  industry: 'SaaS',
  productName: 'Product A',
  productKeywords: ['AI search'],
  productDescription: 'A product for AI visibility workflows.',
  productUrl: 'https://brand.com/product',
};

describe('generateContentBriefFromSuggestion', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the LLM when configured and filters references to allowed specific URLs', async () => {
    vi.stubEnv('CONTENT_BRIEF_LLM_API_KEY', 'test-key');
    vi.stubEnv('CONTENT_BRIEF_LLM_BASE_URL', 'https://llm.example/v1');
    vi.stubEnv('CONTENT_BRIEF_LLM_MODEL', 'brief-model');

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              topic: 'How Product A improves AI search visibility',
              contentType: 'guide',
              intent: 'Help buyers solve recommendation-query visibility gaps.',
              keyPoints: ['Explain the gap', 'Show product proof'],
              references: [
                'https://brand.com/blog/ai-search',
                'https://invented.example/article',
                'https://brand.com',
              ],
              notes: 'Stay inside Product A boundaries.',
              platforms: ['zhihu'],
              titleCandidates: ['AI search visibility guide'],
              mustMention: ['Product A'],
              avoid: ['Do not invent customer cases'],
            }),
          },
        },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const brief = await generateContentBriefFromSuggestion(project, {
      text: 'Improve citation coverage',
      action_sources: ['brand.com/blog/ai-search'],
      evidence_sources: ['brand.com', 'zhihu.com/question/123'],
      action_channels: ['zhihu'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
      }),
    );
    expect(brief.generatedBy).toBe('llm');
    expect(brief.topic).toBe('How Product A improves AI search visibility');
    expect(brief.references).toBe('https://brand.com/blog/ai-search');
    expect(brief.avoid).toEqual(['Do not invent customer cases']);
  });

  it('falls back to deterministic rules when no LLM is configured', async () => {
    const brief = await generateContentBriefFromSuggestion(project, {
      text: 'Improve citation coverage',
      action_type: 'Publish FAQ',
      keywords: ['AI search'],
      action_sources: ['brand.com/blog/ai-search'],
      evidence_sources: ['brand.com'],
      action_channels: ['zhihu'],
    });

    expect(brief.generatedBy).toBe('rules');
    expect(brief.fallbackReason).toBe('missing_llm_config');
    expect(brief.topic).toBe('Publish FAQ：AI search');
    expect(brief.references).toBe('https://brand.com/blog/ai-search');
  });
});
