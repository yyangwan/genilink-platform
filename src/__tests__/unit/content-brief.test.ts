import { describe, expect, it } from 'vitest';
import {
  contentBriefToSearchParams,
  createContentBriefFromSuggestion,
  parseContentBriefSearchParams,
} from '@/lib/content/content-brief';

describe('content brief extraction', () => {
  it('turns a visibility suggestion into content creation fields', () => {
    const brief = createContentBriefFromSuggestion({
      text: 'Improve DeepSeek citation coverage',
      description: 'Create owned content for recommendation prompts.',
      platform: 'DeepSeek',
      action_type: '发布 FAQ 和对比页',
      keywords: ['AI 搜索', '品牌可见性'],
      content_outline: '解释用户问题\n给出产品证据\n加入 FAQ',
      audit_findings: ['DeepSeek did not cite owned pages'],
      acceptance_criteria: ['页面发布并加入结构化问答'],
      evidence_sources: ['zhihu.com/question/123'],
      action_sources: ['brand.com/blog/ai-search'],
      action_channels: ['知乎'],
      evidence_summary: 'Owned pages are missing from recommendation answers.',
      expected_result: 'Increase owned citation rate',
      success_metric: 'Owned page cited in 3 of 5 prompts',
      measurement_plan: 'Rerun audit after indexing.',
    });

    expect(brief.topic).toBe('发布 FAQ 和对比页：AI 搜索 / 品牌可见性');
    expect(brief.keyPoints).toEqual([
      '解释用户问题',
      '给出产品证据',
      '加入 FAQ',
      'DeepSeek did not cite owned pages',
      '页面发布并加入结构化问答',
      'Increase owned citation rate',
      'Owned page cited in 3 of 5 prompts',
      '覆盖关键词：AI 搜索',
    ]);
    expect(brief.references).toBe('brand.com/blog/ai-search\nzhihu.com/question/123');
    expect(brief.notes).toContain('审计依据：Owned pages are missing from recommendation answers.');
    expect(brief.notes).toContain('成功指标：Owned page cited in 3 of 5 prompts');
    expect(brief.platforms).toEqual(['zhihu']);
  });

  it('round-trips brief fields through URL search params', () => {
    const params = contentBriefToSearchParams({
      topic: 'FAQ topic',
      keyPoints: ['Point A', 'Point B'],
      references: 'https://example.com',
      notes: 'Use the audit evidence.',
      platforms: ['wechat', 'zhihu'],
    });

    expect(parseContentBriefSearchParams(params)).toEqual({
      topic: 'FAQ topic',
      keyPoints: ['Point A', 'Point B'],
      references: 'https://example.com',
      notes: 'Use the audit evidence.',
      platforms: ['wechat', 'zhihu'],
    });
  });
});
