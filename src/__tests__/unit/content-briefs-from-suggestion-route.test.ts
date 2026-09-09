import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/content-auth', () => ({
  withContentAuth: (handler: unknown) => async (req: NextRequest) =>
    (handler as (ctx: unknown, req: NextRequest) => Promise<Response>)(
      {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        role: 'member',
        serviceToken: 'content-jwt',
      },
      req,
    ),
}));

vi.mock('@/lib/content/canonical-suggestion', () => ({
  loadCanonicalSuggestion: vi.fn(),
}));

vi.mock('@/lib/content/contentos-brief-client', () => ({
  ContentOSBriefError: class extends Error {
    status: number;
    code: string;
    details?: unknown;
    constructor(status: number, code: string, message: string, details?: unknown) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  },
  createBriefFromSnapshot: vi.fn(),
}));

import { loadCanonicalSuggestion } from '@/lib/content/canonical-suggestion';
import { createBriefFromSnapshot } from '@/lib/content/contentos-brief-client';
import { prisma } from '@/lib/db';
import { POST } from '@/app/api/content/briefs/from-suggestion/route';

function mappedSuggestion() {
  return {
    id: '68',
    report_id: 9,
    audit_id: 7,
    text: '建立品牌百科词条，提升 AI 助手引用',
    description: '补齐官方百科与 FAQ 资产',
    category: '引用可见性',
    platform: '知乎',
    priority: 'high',
    status: 'pending',
    evidence_sources: ['https://example.com/audit'],
    evidence_channels: ['知乎'],
    action_sources: ['https://example.com/baike'],
    action_channels: ['内容'],
    action_type: 'content_publish',
    type_tags: ['百科'],
    keywords: ['AI 搜索'],
    content_outline: '',
    weekly_tasks: [],
    competitor_reference: '',
    expected_result: '',
    evidence_summary: '',
    audit_findings: [],
    success_metric: '',
    audit_evidence: [],
    acceptance_criteria: [],
    measurement_plan: '',
  };
}

function postReq(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/content/briefs/from-suggestion?projectId=project-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const IDP = { 'idempotency-key': 'key-001' };

describe('POST /api/content/briefs/from-suggestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadCanonicalSuggestion).mockResolvedValue({
      ok: true,
      suggestion: mappedSuggestion() as never,
    });
    (prisma.project.findFirst as any).mockResolvedValue({
      id: 'project-1',
      name: '示例项目',
      url: 'https://example.com',
      industry: '企业服务',
      productName: '示例产品',
      productKeywords: ['AI 搜索'],
      productDescription: '示例产品帮助企业追踪品牌表现。',
    });
  });

  it('creates a brief from the canonical suggestion (201, no billing usage)', async () => {
    vi.mocked(createBriefFromSnapshot).mockResolvedValue({
      data: { id: 'brief_1', refinement: { status: 'queued' } },
      replayed: false,
    });

    const res = await POST(postReq({ suggestionId: '68' }, IDP));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.id).toBe('brief_1');
    expect(body.meta.replayed).toBe(false);
    expect(body.meta.sourceHash).toMatch(/^[0-9a-f]{64}$/);

    // 只按 suggestionId 从服务端重新读取，不使用浏览器回传正文。
    expect(loadCanonicalSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        suggestionId: '68',
      }),
    );
    // 请求只包含白名单快照 + 项目快照 + 引用。
    const calls = vi.mocked(createBriefFromSnapshot).mock.calls as unknown as Array<
      [
        { projectId: string; serviceToken: string },
        { sourceSnapshot: Record<string, unknown>; projectSnapshot: Record<string, unknown> },
        string,
      ]
    >;
    const call = calls[0];
    expect(call[0]).toEqual({ projectId: 'project-1', serviceToken: 'content-jwt' });
    expect(call[1].sourceSnapshot).toMatchObject({ suggestionId: '68', schemaVersion: 1 });
    expect(call[1].sourceSnapshot.cookies).toBeUndefined();
    expect(call[1].projectSnapshot).toMatchObject({ projectId: 'project-1' });
    expect(call[2]).toBe('key-001');
  });

  it('returns 200 with replayed=true on idempotent replay', async () => {
    vi.mocked(createBriefFromSnapshot).mockResolvedValue({
      data: { id: 'brief_1' },
      replayed: true,
    });

    const res = await POST(postReq({ suggestionId: '68' }, IDP));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.meta.replayed).toBe(true);
  });

  it('rejects a request that carries suggestion body fields', async () => {
    const res = await POST(postReq({ suggestionId: '68', suggestion: { text: '伪造建议' } }, IDP));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('SUGGESTION_PAYLOAD_FORBIDDEN');
    expect(createBriefFromSnapshot).not.toHaveBeenCalled();
  });

  it('requires an idempotency key', async () => {
    const res = await POST(postReq({ suggestionId: '68' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('returns 404 when the suggestion is absent from the project', async () => {
    vi.mocked(loadCanonicalSuggestion).mockResolvedValue({
      ok: false,
      code: 'SUGGESTION_NOT_FOUND',
    });
    const res = await POST(postReq({ suggestionId: '999' }, IDP));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('SUGGESTION_NOT_FOUND');
  });

  it('returns 502 when visibility is unavailable', async () => {
    vi.mocked(loadCanonicalSuggestion).mockResolvedValue({
      ok: false,
      code: 'VISIBILITY_UNAVAILABLE',
    });
    const res = await POST(postReq({ suggestionId: '68' }, IDP));
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('VISIBILITY_UNAVAILABLE');
  });

  it('returns 422 SOURCE_PAYLOAD_TOO_LARGE with field names when limits are exceeded', async () => {
    const suggestion = mappedSuggestion();
    suggestion.text = '长'.repeat(600);
    vi.mocked(loadCanonicalSuggestion).mockResolvedValue({ ok: true, suggestion: suggestion as never });

    const res = await POST(postReq({ suggestionId: '68' }, IDP));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('SOURCE_PAYLOAD_TOO_LARGE');
    expect(body.error.fields).toContain('text');
    expect(createBriefFromSnapshot).not.toHaveBeenCalled();
  });

  it('maps ContentOS eligibility rejection to 422 with customer-facing copy', async () => {
    const { ContentOSBriefError } = await import('@/lib/content/contentos-brief-client');
    vi.mocked(createBriefFromSnapshot).mockRejectedValue(
      new ContentOSBriefError(422, 'SUGGESTION_NOT_CONTENT_ELIGIBLE', 'ineligible'),
    );
    const res = await POST(postReq({ suggestionId: '68' }, IDP));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('SUGGESTION_NOT_CONTENT_ELIGIBLE');
    expect(body.error.message).toContain('技术/运营任务');
  });

  it('maps ContentOS 5xx and timeouts to 503 CONTENT_SERVICE_UNAVAILABLE', async () => {
    const { ContentOSBriefError } = await import('@/lib/content/contentos-brief-client');
    vi.mocked(createBriefFromSnapshot).mockRejectedValue(
      new ContentOSBriefError(500, 'internal_error', 'boom'),
    );
    const res = await POST(postReq({ suggestionId: '68' }, IDP));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('internal_error');
  });
});
