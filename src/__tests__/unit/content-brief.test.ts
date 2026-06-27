import { describe, expect, it } from 'vitest';
import {
  contentBriefToSearchParams,
  createContentBriefFromSuggestion,
  parseContentBriefSearchParams,
} from '@/lib/content/content-brief';

describe('content brief extraction', () => {
  it('turns a visibility suggestion into content creation fields and filters homepage references', () => {
    const brief = createContentBriefFromSuggestion({
      text: 'Improve DeepSeek citation coverage',
      description: 'Create owned content for recommendation prompts.',
      platform: 'zhihu',
      action_type: 'Publish FAQ and comparison page',
      keywords: ['AI search', 'brand visibility'],
      content_outline: 'Explain the user question\nAdd product proof\nAdd FAQ',
      audit_findings: ['DeepSeek did not cite owned pages'],
      acceptance_criteria: ['Publish page with structured FAQ'],
      evidence_sources: ['brand.com', 'zhihu.com/question/123'],
      action_sources: ['brand.com/blog/ai-search'],
      action_channels: ['zhihu'],
      evidence_summary: 'Owned pages are missing from recommendation answers.',
      expected_result: 'Increase owned citation rate',
      success_metric: 'Owned page cited in 3 of 5 prompts',
      measurement_plan: 'Rerun audit after indexing.',
    });

    expect(brief.topic).toBe('Publish FAQ and comparison page：AI search / brand visibility');
    expect(brief.keyPoints).toEqual([
      'Explain the user question',
      'Add product proof',
      'Add FAQ',
      'DeepSeek did not cite owned pages',
      'Publish page with structured FAQ',
      'Increase owned citation rate',
      'Owned page cited in 3 of 5 prompts',
      '覆盖关键词：AI search',
    ]);
    expect(brief.references).toBe('https://brand.com/blog/ai-search\nhttps://zhihu.com/question/123');
    expect(brief.notes).toContain('审计依据：Owned pages are missing from recommendation answers.');
    expect(brief.notes).toContain('成功指标：Owned page cited in 3 of 5 prompts');
    expect(brief.platforms).toEqual(['zhihu']);
  });

  it('round-trips brief fields through URL search params', () => {
    const params = contentBriefToSearchParams({
      topic: 'FAQ topic',
      keyPoints: ['Point A', 'Point B'],
      references: 'https://example.com/article/a',
      notes: 'Use the audit evidence.',
      platforms: ['wechat', 'zhihu'],
    });

    expect(parseContentBriefSearchParams(params)).toEqual({
      topic: 'FAQ topic',
      keyPoints: ['Point A', 'Point B'],
      references: 'https://example.com/article/a',
      notes: 'Use the audit evidence.',
      platforms: ['wechat', 'zhihu'],
    });
  });
});
