import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getAuditsHistory } from '@/app/api/integration/trends/audits-history/route';
import { POST as compareAudits } from '@/app/api/integration/strategic/compare-audits/route';

// Mock auth & workspace
vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));
vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('ws-1'),
}));
vi.mock('@/lib/auth/workspace', () => ({
  verifyProjectInWorkspace: vi.fn().mockResolvedValue({ id: 'proj-1' }),
  getWorkspaceRole: vi.fn().mockResolvedValue('owner'),
}));
vi.mock('@/lib/billing/guard', () => ({
  requireBilling: vi.fn().mockResolvedValue(undefined),
  BillingError: class extends Error {},
}));
vi.mock('@/lib/auth/service-jwt', () => ({
  issueVisibilityProjectJWT: vi.fn().mockResolvedValue('project-jwt'),
  issueVisibilityWorkspaceJWT: vi.fn().mockResolvedValue('workspace-jwt'),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const makeReq = (url: string, init?: RequestInit) => new NextRequest(new Request(url, init));

const historyResponse = [
  { id: 1, status: 'completed', platforms: ['gpt-4'], created_at: '2026-05-01T00:00:00Z', completed_at: '2026-05-01T01:00:00Z' },
  { id: 2, status: 'completed', platforms: ['gpt-4', 'claude-3'], created_at: '2026-05-15T00:00:00Z', completed_at: '2026-05-15T01:00:00Z' },
  { id: 3, status: 'failed', platforms: ['gpt-4'], created_at: '2026-05-20T00:00:00Z', completed_at: null },
];

const compareResponse = {
  audits: [
    { audit_id: 1, date: '2026-05-01', overall_score: 72, mention_rate: 0.45, sentiment_breakdown: { positive: 60, neutral: 30, negative: 10 }, top_sources: [{ domain: 'example.com', count: 5 }], competitor_mention_rates: [{ brand: 'BrandX', mention_rate: 0.3 }], structure_distribution: { list: 50, comparison: 30 }, topic_distribution: { pricing: 20 } },
    { audit_id: 2, date: '2026-05-15', overall_score: 78, mention_rate: 0.52, sentiment_breakdown: { positive: 65, neutral: 25, negative: 10 }, top_sources: [{ domain: 'example.com', count: 8 }, { domain: 'newsource.com', count: 3 }], competitor_mention_rates: [{ brand: 'BrandX', mention_rate: 0.25 }], structure_distribution: { list: 55, comparison: 25 }, topic_distribution: { pricing: 18 } },
  ],
  diffs: {
    mention_rate_delta: 0.07,
    score_delta: 6,
    source_changes: { added: ['newsource.com'], removed: [] },
    competitor_changes: [{ brand: 'BrandX', delta: -0.05 }],
  },
};

describe('GET /api/integration/trends/audits-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns audit history from upstream', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(historyResponse) });

    const req = makeReq('http://localhost/api/integration/trends/audits-history?projectId=proj-1');
    const res = await getAuditsHistory(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(3);
    expect(data[0].id).toBe(1);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/trends/proj-1/audits-history?limit=20'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer project-jwt' }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns 502 on upstream failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const req = makeReq('http://localhost/api/integration/trends/audits-history?projectId=proj-1');
    const res = await getAuditsHistory(req);

    expect(res.status).toBe(502);
  });

});

describe('POST /api/integration/strategic/compare-audits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns comparison data from upstream', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(compareResponse) });

    const req = makeReq('http://localhost/api/integration/strategic/compare-audits?projectId=proj-1', {
      method: 'POST',
      body: JSON.stringify({ audit_ids: [1, 2] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await compareAudits(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.audits).toHaveLength(2);
    expect(data.diffs.score_delta).toBe(6);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/strategic/projects/proj-1/compare-audits'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ audit_ids: [1, 2] }),
      }),
    );
  });

  it('rejects fewer than 2 audit_ids', async () => {
    const req = makeReq('http://localhost/api/integration/strategic/compare-audits?projectId=proj-1', {
      method: 'POST',
      body: JSON.stringify({ audit_ids: [1] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await compareAudits(req);

    expect(res.status).toBe(400);
  });

  it('rejects more than 5 audit_ids', async () => {
    const req = makeReq('http://localhost/api/integration/strategic/compare-audits?projectId=proj-1', {
      method: 'POST',
      body: JSON.stringify({ audit_ids: [1, 2, 3, 4, 5, 6] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await compareAudits(req);

    expect(res.status).toBe(400);
  });

  it('returns 502 on upstream failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const req = makeReq('http://localhost/api/integration/strategic/compare-audits?projectId=proj-1', {
      method: 'POST',
      body: JSON.stringify({ audit_ids: [1, 2] }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await compareAudits(req);

    expect(res.status).toBe(502);
  });
});
