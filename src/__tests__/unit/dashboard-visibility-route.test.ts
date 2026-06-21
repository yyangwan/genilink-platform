import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
  }),
}));

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('workspace-1'),
}));

vi.mock('@/lib/auth/workspace', () => ({
  getWorkspaceRole: vi.fn().mockResolvedValue('owner'),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }),
    },
  },
}));

vi.mock('@/lib/auth/service-jwt', () => ({
  issueVisibilityProjectJWT: vi.fn().mockResolvedValue('project-jwt'),
}));

import { GET } from '@/app/api/dashboard/visibility/route';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GET /api/dashboard/visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty summary when no project is selected', async () => {
    const req = new NextRequest('http://localhost/api/dashboard/visibility');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      overallScore: null,
      mentionCount: 0,
      platformCoverage: [],
      competitorRank: null,
      suggestions: [],
      latestAuditDate: null,
      trend: [],
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps upstream visibility data for the selected project', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
      if (url.includes('/competitor-positioning')) {
        return new Response(JSON.stringify({
          brands: [
            { name: 'Our Brand', mention_count: 5, mention_frequency: 0.8, is_competitor: false },
            { name: 'Rival', mention_count: 2, mention_frequency: 0.2, is_competitor: true },
          ],
        }), { status: 200 });
      }
      if (url.includes('/audits-history')) {
        return new Response(JSON.stringify([
          { id: 9, created_at: '2026-06-03T00:00:00Z', status: 'completed', platforms: ['chatgpt'] },
        ]), { status: 200 });
      }
      if (url.includes('/suggestions/')) {
        return new Response(JSON.stringify([
          { priority: 'high', text: 'Do X' },
        ]), { status: 200 });
      }
      if (url.endsWith('/api/platforms')) {
        return new Response(JSON.stringify([
          { key: 'chatgpt', label: 'ChatGPT' },
        ]), { status: 200 });
      }
      if (url.includes('/results')) {
        return new Response(JSON.stringify([
          {
            platform: 'chatgpt',
            brand_name: 'Our Brand',
            mention_found: true,
            mention_confidence: 0.8,
            is_recommended: true,
            recommendation_rank: 1,
            error: null,
          },
        ]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const req = new NextRequest('http://localhost/api/dashboard/visibility?project=project-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({
      overallScore: 80,
      mentionCount: 5,
      platformCoverage: [{ name: 'ChatGPT', score: 80 }],
      competitorRank: 1,
      suggestions: [{ priority: 'high', text: 'Do X' }],
      latestAuditDate: '2026-06-03T00:00:00Z',
      trend: [{ date: '2026-06-03T00:00:00Z', score: 80 }],
    });
  });

  it('keeps zero-score platforms from the latest audit in platform coverage', async () => {
    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
      if (url.includes('/competitor-positioning')) {
        return new Response(JSON.stringify({
          brands: [
            { name: 'Our Brand', mention_count: 1, mention_frequency: 0.25, is_competitor: false },
          ],
        }), { status: 200 });
      }
      if (url.includes('/audits-history')) {
        return new Response(JSON.stringify([
          {
            id: 27,
            created_at: '2026-06-18T17:12:40Z',
            status: 'partial',
            platforms: ['deepseek', 'qwen', 'doubao', 'kimi'],
          },
        ]), { status: 200 });
      }
      if (url.includes('/suggestions/')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.endsWith('/api/platforms')) {
        return new Response(JSON.stringify([
          { key: 'deepseek', label: 'DeepSeek' },
          { key: 'qwen', label: '通义千问' },
          { key: 'doubao', label: '豆包' },
          { key: 'kimi', label: 'Kimi' },
        ]), { status: 200 });
      }
      if (url.includes('/results')) {
        return new Response(JSON.stringify([
          {
            platform: 'deepseek',
            brand_name: 'Our Brand',
            mention_found: true,
            mention_confidence: 0.8,
            is_recommended: true,
            recommendation_rank: 1,
            error: null,
          },
          {
            platform: 'qwen',
            brand_name: 'Our Brand',
            mention_found: false,
            mention_confidence: null,
            is_recommended: false,
            recommendation_rank: null,
            error: null,
          },
          {
            platform: 'doubao',
            brand_name: 'Our Brand',
            mention_found: false,
            mention_confidence: null,
            is_recommended: false,
            recommendation_rank: null,
            error: null,
          },
          {
            platform: 'kimi',
            brand_name: 'Our Brand',
            mention_found: false,
            mention_confidence: null,
            is_recommended: false,
            recommendation_rank: null,
            error: 'platform failed',
          },
        ]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    const req = new NextRequest('http://localhost/api/dashboard/visibility?project=project-1');
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.platformCoverage).toEqual([
      { name: 'DeepSeek', score: 80 },
      { name: '通义千问', score: 0 },
      { name: '豆包', score: 0 },
      { name: 'Kimi', score: 0 },
    ]);
  });
});
