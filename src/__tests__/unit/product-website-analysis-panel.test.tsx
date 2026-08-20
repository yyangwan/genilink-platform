// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductWebsiteAnalysisPanel } from '@/components/product-website/product-website-analysis-panel';

const analysis = {
  id: 7,
  target_url: 'https://example.com',
  status: 'completed',
  score_overall: 38.5,
  score_grade: 'D',
  completed_at: '2026-08-10T13:23:25Z',
  result_snapshot: {
    score: { overall: 38.5, grade: 'D', dimensions: { technical: 45 } },
    page: { title: 'Example', metaDescription: 'Example description' },
    contentDetail: { metadata: { finalUrl: 'https://example.com' } },
    dimensionDiagnostics: { technical: { label: '技术可读', score: 45, status: 'weak', issues: ['缺少机器可读文件'] } },
    recommendations: [{ title: '补充结构化数据', priority: 'high', actions: ['添加 JSON-LD'] }],
    geoAudit: {
      platformPresence: {
        score: 72,
        models: [
          { id: 'qwen', label: 'Qwen' },
          { id: 'yuanbao', label: 'Hunyuan' },
        ],
        platforms: [{ id: 'zhihu', label: '知乎', found: true }],
        modelAdvice: [{ model: 'doubao', label: 'Doubao', score: 45, missingPlatforms: ['baike'], advice: '补充百科实体页' }],
      },
    },
    aiCitations: {
      enabled: true,
      prompts: ['示例问题'],
      platforms: [{ platform: 'qwen', status: 'completed', citationCount: 2, ownDomainCitationCount: 1, mentionsProduct: true }],
    },
    technicalAudit: {
      robots: { found: false },
      llms: { found: false },
      llmsFull: { found: true },
    },
  },
} as const;

describe('ProductWebsiteAnalysisPanel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/trends?')) {
        return Response.json({
          projectId: 'project-1',
          range: '30d',
          points: [{ analysisId: 7, date: '2026-08-10T13:23:25Z', overall: 38.5, status: 'completed' }],
          summary: { currentScore: 38.5, delta: null },
        });
      }
      if (url.endsWith('/analyze')) {
        return Response.json({ analysisId: 7, status: 'queued' });
      }
      if (url.includes('/product-website/7')) {
        return Response.json(analysis);
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method || 'GET'}`);
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows scored trend data and always starts Firecrawl with real AI citations', async () => {
    render(<ProductWebsiteAnalysisPanel projectId="project-1" productUrl="https://example.com" />);

    await screen.findByText('重新分析');
    expect(screen.getAllByText('38.5').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('08/10')).toBeTruthy();
    expect(screen.getByText('真实 AI 引用')).toBeTruthy();
    expect(screen.queryByTitle('抓取方式')).toBeNull();
    expect(screen.getAllByTitle('通义千问').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTitle('腾讯元宝')).toBeTruthy();
    expect(screen.getByTitle('豆包')).toBeTruthy();
    expect(screen.queryByText('Qwen')).toBeNull();
    expect(screen.queryByText('Hunyuan')).toBeNull();
    expect(screen.queryByText('Doubao')).toBeNull();

    for (const label of ['详细内容', '维度诊断', '优化建议']) {
      const tab = screen.getByRole('button', { name: label });
      expect(tab.className).toContain('cursor-pointer');
      expect(tab.querySelector('svg')?.getAttribute('class')).toContain('group-hover:scale-110');
    }

    fireEvent.click(screen.getByRole('button', { name: '重新分析' }));
    await waitFor(() => {
      const postCall = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'POST');
      expect(postCall).toBeTruthy();
      expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
        projectId: 'project-1',
        enableAiCitation: true,
        crawlerProvider: 'firecrawl',
      });
    });
  });

  it('uses progressive disclosure and offers drafts for confirmed missing technical files', async () => {
    render(<ProductWebsiteAnalysisPanel projectId="project-1" productUrl="https://example.com" />);

    await screen.findByText('重新分析');
    fireEvent.click(screen.getByRole('button', { name: '维度诊断' }));
    expect(screen.getAllByText('优先改进').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('技术可读').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('缺少机器可读文件')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '优化建议' }));
    expect(screen.getByText('技术文件修复包')).toBeTruthy();
    expect(screen.getByRole('button', { name: '下载 robots.txt 草稿' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '下载 llms.txt 草稿' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '下载 llms-full.txt 草稿' })).toBeNull();
    expect(screen.getByText('优先处理 · 1')).toBeTruthy();
    expect(screen.getByText('添加 JSON-LD')).toBeTruthy();
  });
});
