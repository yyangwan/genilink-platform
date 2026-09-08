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
    }, {
      name: '智链',
      industry: 'SaaS',
      productName: 'GEO',
      productKeywords: ['AI search', 'brand visibility'],
      productDescription: 'An AI search visibility platform.',
    });

    expect(brief.topic).toBe('智链（GEO）常见问题：AI search与brand visibility的理解与应用');
    expect(brief.keyPoints).toEqual([
      '先回答读者最关心的问题：智链与GEO是什么、解决什么问题',
      '说明SaaS场景下的典型痛点，以及为什么需要关注AI search、brand visibility',
      '基于已确认信息拆解核心定位与能力：An AI search visibility platform.',
      '用具体使用场景说明智链能为用户带来的价值，不虚构案例或效果数据',
      '围绕AI search、brand visibility回答常见疑问，并给出清晰、可执行的理解路径',
      '总结选择或评估相关方案时应关注的指标、证据和下一步行动',
    ]);
    expect(brief.references).toBe('https://brand.com/blog/ai-search\nhttps://zhihu.com/question/123');
    expect(brief.notes).toContain('不在正文中复述任务或审计话术');
    expect(brief.notes).toContain('发布后观察：Owned page cited in 3 of 5 prompts');
    expect(brief.platforms).toEqual(['zhihu']);
  });

  it('turns an encyclopedia optimization task into a reader-facing editorial brief', () => {
    const suggestionText = '建立百度百科词条获得DeepSeek引用';
    const brief = createContentBriefFromSuggestion({
      text: suggestionText,
      description: '补充品牌权威实体信息，提升大模型引用概率。',
      action_type: '建立品牌百科词条',
      keywords: ['geo', 'ai可见性', 'ai搜索'],
      expected_result: '增加DeepSeek对品牌信息的引用',
    }, {
      name: '智链',
      industry: '科技',
      productName: 'GEO',
      productKeywords: ['geo', 'ai可见性', 'ai搜索'],
      productDescription: '全链路AI搜索增长平台',
    });

    expect(brief.topic).toBe('智链是什么？全链路AI搜索增长平台的定位、核心能力与应用场景');
    expect(brief.topic).not.toContain(suggestionText);
    expect(brief.keyPoints).toHaveLength(6);
    expect(brief.keyPoints).not.toContain(suggestionText);
    expect(brief.keyPoints[0]).toBe('先回答读者最关心的问题：智链与GEO是什么、解决什么问题');
    expect(brief.notes).not.toContain(`原始建议：${suggestionText}`);
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
