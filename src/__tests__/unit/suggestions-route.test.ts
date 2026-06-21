import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/proxy/route-guard', () => ({
  resolveGuard: vi.fn(),
  fetchUpstream: vi.fn(),
}));

import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { GET } from '@/app/api/integration/suggestions/route';

const guardCtx = {
  session: { user: { id: 'user-1' } },
  workspaceId: 'workspace-1',
  projectId: 'project-1',
  serviceToken: 'token-1',
  upstreamUrl: (path: string) => `http://upstream${path}`,
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token-1' },
};

describe('/api/integration/suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveGuard).mockResolvedValue({
      ok: true,
      ctx: guardCtx,
    });
  });

  it('fetches audit-scoped suggestions and preserves audit evidence fields', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({
      data: [
        {
          id: 154,
          report_id: 9,
          audit_id: 7,
          title: 'Improve DeepSeek citation coverage',
          description: 'Create an FAQ answer page for purchase-intent prompts.',
          category: 'content_optimization',
          priority: 'high',
          is_resolved: false,
          detail: {
            evidence_summary: 'DeepSeek did not cite owned pages for recommendation prompts.',
            audit_findings: ['Owned brand appeared after two competitors'],
            success_metric: 'Owned page cited in at least 3 of 5 DeepSeek prompts',
            audit_evidence: [{ platform: 'deepseek', prompt: 'best tools', finding: 'No owned citation' }],
            evidence_sources: ['zhihu.com/question/123', 'brand.com/blog/deepseek'],
            evidence_channels: ['知乎', '官网博客'],
            action_sources: ['brand.com/blog/deepseek', 'zhihu.com/question/123'],
            action_channels: ['content'],
            action_type: '发布FAQ和对比页',
            outline: ['Answer direct comparison question', 'Add proof points'],
            timeline: [{ week: 'Week 1', task: 'Publish FAQ page' }],
            competitor_ref: 'Competitor A has comparison content',
            expected_outcome: 'Higher citation rate',
            acceptance_criteria: ['Page is published', 'Schema is added'],
            measurement_plan: 'Rerun audit after indexing.',
          },
        },
      ],
    });

    const req = new NextRequest('http://localhost/api/integration/suggestions?projectId=project-1&auditId=7');

    const res = await GET(req);
    const body = await res.json();

    expect(fetchUpstream).toHaveBeenCalledWith(
      guardCtx,
      '/api/suggestions/project-1?audit_id=7',
      expect.objectContaining({ errorMessage: 'Failed to fetch suggestions' }),
    );
    expect(res.status).toBe(200);
    expect(body[0]).toMatchObject({
      id: '154',
      report_id: 9,
      audit_id: 7,
      text: 'Improve DeepSeek citation coverage',
      evidence_summary: 'DeepSeek did not cite owned pages for recommendation prompts.',
      audit_findings: ['Owned brand appeared after two competitors'],
      success_metric: 'Owned page cited in at least 3 of 5 DeepSeek prompts',
      evidence_sources: ['zhihu.com/question/123', 'brand.com/blog/deepseek'],
      evidence_channels: ['知乎', '官网博客'],
      action_sources: ['brand.com/blog/deepseek', 'zhihu.com/question/123'],
      action_channels: ['content'],
      action_type: '发布FAQ和对比页',
      content_outline: 'Answer direct comparison question\nAdd proof points',
      weekly_tasks: [{ week: 'Week 1', tasks: ['Publish FAQ page'] }],
      competitor_reference: 'Competitor A has comparison content',
      expected_result: 'Higher citation rate',
      acceptance_criteria: ['Page is published', 'Schema is added'],
      measurement_plan: 'Rerun audit after indexing.',
    });
  });
});
