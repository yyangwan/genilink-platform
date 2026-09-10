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

vi.mock('@/lib/content/capabilities', () => ({
  getGenerationCapabilities: vi.fn().mockResolvedValue({
    schemaVersion: 1,
    platforms: {
      wechat: { enabled: true },
      weibo: { enabled: true },
      xiaohongshu: { enabled: true },
      douyin: { enabled: true },
      zhihu: { enabled: false, reason: 'generator_not_implemented' },
      toutiao: { enabled: false, reason: 'generator_not_implemented' },
    },
  }),
  isPlatformSupported: (caps: { platforms: Record<string, { enabled: boolean }> }, platform: string) =>
    caps.platforms[platform]?.enabled === true,
}));

vi.mock('@/lib/billing/usage-reservations', () => ({
  reserveContentGeneration: vi.fn(),
  releaseUsageOperation: vi.fn(),
  markPendingReconcile: vi.fn(),
}));

vi.mock('@/lib/content/contentos-internal-client', () => ({
  lookupWorkflowByOperation: vi.fn(),
}));

vi.mock('@/lib/content/content-workflow-client', () => ({
  ContentOSWorkflowError: class extends Error {
    status: number;
    code: string;
    extras?: Record<string, unknown>;
    constructor(status: number, code: string, message: string, extras?: Record<string, unknown>) {
      super(message);
      this.status = status;
      this.code = code;
      this.extras = extras;
    }
  },
  createContentWorkflow: vi.fn(),
}));

import {
  reserveContentGeneration,
  releaseUsageOperation,
  markPendingReconcile,
} from '@/lib/billing/usage-reservations';
import { createContentWorkflow } from '@/lib/content/content-workflow-client';
import { lookupWorkflowByOperation } from '@/lib/content/contentos-internal-client';
import { PlanLimitError } from '@/lib/billing/usage';
import { sha256 } from '@/lib/billing/idempotency';
import { POST } from '@/app/api/content/workflows/route';

const IDP = { 'idempotency-key': 'key-001' };

function postReq(body: unknown, headers: Record<string, string> = IDP) {
  return new NextRequest('http://localhost/api/content/workflows?projectId=project-1', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const WORKFLOW_BODY = {
  briefId: 'brief_1',
  briefRevision: 3,
  platforms: ['wechat', 'xiaohongshu'],
};

describe('POST /api/content/workflows（设计 §10.5）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reserves usage with a derived operationId, then creates and returns 202', async () => {
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'reserved', usageEventId: 'ue-1' });
    vi.mocked(createContentWorkflow).mockResolvedValue({
      data: { id: 'wf_1', platforms: [] } as never,
      replayed: false,
    });

    const res = await POST(postReq(WORKFLOW_BODY));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.data.id).toBe('wf_1');
    expect(body.meta.replayed).toBe(false);

    const expectedOperation = `content-workflow:workspace-1:${sha256('key-001')}`;
    expect(reserveContentGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        operationId: expectedOperation,
      }),
    );
    const createCall = vi.mocked(createContentWorkflow).mock.calls[0];
    expect(createCall[1]).toMatchObject({
      briefId: 'brief_1',
      platforms: ['wechat', 'xiaohongshu'],
      usageOperationId: expectedOperation,
    });
    expect(createCall[2]).toBe('key-001');
    // 成功路径不释放、不对账。
    expect(releaseUsageOperation).not.toHaveBeenCalled();
    expect(markPendingReconcile).not.toHaveBeenCalled();
  });

  it('returns 402 PLAN_LIMIT_EXCEEDED without calling ContentOS when quota is exhausted', async () => {
    vi.mocked(reserveContentGeneration).mockResolvedValue({
      type: 'limit',
      error: new PlanLimitError('content_generation', 10, 10),
    });

    const res = await POST(postReq(WORKFLOW_BODY));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('PLAN_LIMIT_EXCEEDED');
    expect(createContentWorkflow).not.toHaveBeenCalled();
  });

  it('rejects unsupported platforms with 422 before reserving', async () => {
    const res = await POST(postReq({ ...WORKFLOW_BODY, platforms: ['zhihu'] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe('PLATFORM_NOT_SUPPORTED');
    expect(reserveContentGeneration).not.toHaveBeenCalled();
  });

  it('releases the reservation on definite 4xx rejection only after confirming no workflow exists (R4)', async () => {
    const { ContentOSWorkflowError } = await import('@/lib/content/content-workflow-client');
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'reserved', usageEventId: 'ue-1' });
    vi.mocked(createContentWorkflow).mockRejectedValue(
      new ContentOSWorkflowError(409, 'BRIEF_VERSION_CONFLICT', '创作方案已更新', {
        currentRevision: 8,
      }),
    );
    // 4xx 不能直接证明从未受理：先按 operationId 查证，明确不存在才释放。
    vi.mocked(lookupWorkflowByOperation).mockResolvedValue({ found: false });

    const res = await POST(postReq(WORKFLOW_BODY));
    expect(res.status).toBe(409);
    expect(releaseUsageOperation).toHaveBeenCalledWith(
      expect.stringMatching(/^content-workflow:workspace-1:[0-9a-f]{64}$/),
      'rejected:BRIEF_VERSION_CONFLICT',
    );
    expect(markPendingReconcile).not.toHaveBeenCalled();
  });

  it('keeps the reservation when 4xx arrives but the workflow actually exists (R4)', async () => {
    const { ContentOSWorkflowError } = await import('@/lib/content/content-workflow-client');
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'reserved', usageEventId: 'ue-1' });
    vi.mocked(createContentWorkflow).mockRejectedValue(
      new ContentOSWorkflowError(409, 'BRIEF_VERSION_CONFLICT', '创作方案已更新'),
    );
    // 工作流其实已受理（响应丢失后的重放被版本校验拒绝）：不得释放，否则 worker 永远无法提交额度。
    vi.mocked(lookupWorkflowByOperation).mockResolvedValue({
      found: true,
      usageStatus: 'reserved',
      workflowStatus: 'generating',
    });

    const res = await POST(postReq(WORKFLOW_BODY));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe('WORKFLOW_ALREADY_EXISTS');
    expect(releaseUsageOperation).not.toHaveBeenCalled();
    expect(markPendingReconcile).not.toHaveBeenCalled();
  });

  it('marks pending_reconcile instead of releasing when the lookup is unavailable (R4)', async () => {
    const { ContentOSWorkflowError } = await import('@/lib/content/content-workflow-client');
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'reserved', usageEventId: 'ue-1' });
    vi.mocked(createContentWorkflow).mockRejectedValue(
      new ContentOSWorkflowError(409, 'BRIEF_VERSION_CONFLICT', '创作方案已更新'),
    );
    vi.mocked(lookupWorkflowByOperation).mockResolvedValue({ found: false, unavailable: true });

    const res = await POST(postReq(WORKFLOW_BODY));
    expect(res.status).toBe(503);
    expect(markPendingReconcile).toHaveBeenCalled();
    expect(releaseUsageOperation).not.toHaveBeenCalled();
  });

  it('rejects new submissions while the kill switch is on (R7)', async () => {
    process.env.CONTENT_WORKFLOW_DISABLED = 'true';
    try {
      const res = await POST(postReq(WORKFLOW_BODY));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe('CONTENT_WORKFLOW_DISABLED');
      expect(vi.mocked(reserveContentGeneration)).not.toHaveBeenCalled();
    } finally {
      delete process.env.CONTENT_WORKFLOW_DISABLED;
    }
  });

  it('marks pending_reconcile (never releases) on ambiguous timeout', async () => {
    const { ContentOSWorkflowError } = await import('@/lib/content/content-workflow-client');
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'reserved', usageEventId: 'ue-1' });
    vi.mocked(createContentWorkflow).mockRejectedValue(
      new ContentOSWorkflowError(0, 'CONTENT_SERVICE_UNAVAILABLE', '不可用'),
    );

    const res = await POST(postReq(WORKFLOW_BODY));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.meta.uncertain).toBe(true);
    expect(body.error.code).toBe('WORKFLOW_CREATE_PENDING');
    expect(markPendingReconcile).toHaveBeenCalled();
    expect(releaseUsageOperation).not.toHaveBeenCalled();
  });

  it('replays do not double-charge: reservation replay + ContentOS replay', async () => {
    vi.mocked(reserveContentGeneration).mockResolvedValue({
      type: 'replay',
      usageEventId: 'ue-1',
      status: 'committed',
    });
    vi.mocked(createContentWorkflow).mockResolvedValue({
      data: { id: 'wf_1', platforms: [] } as never,
      replayed: true,
    });

    const res = await POST(postReq(WORKFLOW_BODY));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.meta.replayed).toBe(true);
  });

  it('requires an idempotency key', async () => {
    const res = await POST(postReq(WORKFLOW_BODY, {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('validates body shape (briefRevision must be a positive integer)', async () => {
    const res = await POST(postReq({ ...WORKFLOW_BODY, briefRevision: 0 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_BRIEF_REVISION');
  });
});
