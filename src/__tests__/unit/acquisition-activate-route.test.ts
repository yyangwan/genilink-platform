import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveWorkspaceId: vi.fn(),
  resolveGuard: vi.fn(),
  startAnalysis: vi.fn(),
  intentFind: vi.fn(),
  intentUpdateMany: vi.fn(),
  intentUpdate: vi.fn(),
  sessionUpdate: vi.fn(),
  userUpdate: vi.fn(),
  projectFindFirst: vi.fn(),
  projectFindUnique: vi.fn(),
  projectCreate: vi.fn(),
  workspaceCreate: vi.fn(),
  memberCreate: vi.fn(),
  eventUpsert: vi.fn(),
}));

vi.mock('@/lib/auth/config', () => ({ auth: mocks.auth }));
vi.mock('@/lib/auth/get-workspace', () => ({ resolveWorkspaceId: mocks.resolveWorkspaceId }));
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: mocks.resolveGuard }));
vi.mock('@/lib/product-website/start-analysis', () => ({ startProductWebsiteAnalysis: mocks.startAnalysis }));
vi.mock('@/lib/db', () => {
  const tx = {
    acquisitionIntent: { updateMany: mocks.intentUpdateMany, update: mocks.intentUpdate },
    acquisitionSession: { update: mocks.sessionUpdate },
    user: { update: mocks.userUpdate },
    project: { findFirst: mocks.projectFindFirst, findUnique: mocks.projectFindUnique, create: mocks.projectCreate },
    workspace: { create: mocks.workspaceCreate },
    workspaceMember: { create: mocks.memberCreate },
    funnelEvent: { upsert: mocks.eventUpsert },
  };
  return {
    prisma: {
      acquisitionIntent: { findUnique: mocks.intentFind, updateMany: mocks.intentUpdateMany, update: mocks.intentUpdate },
      funnelEvent: { upsert: mocks.eventUpsert },
      $transaction: vi.fn((value: unknown) => Array.isArray(value) ? Promise.all(value) : (value as (arg: typeof tx) => unknown)(tx)),
    },
  };
});

import { POST } from '@/app/api/acquisition/activate/route';

function request() {
  return new NextRequest('https://genilink.cn/api/acquisition/activate', {
    method: 'POST',
    headers: { cookie: 'genilink-intent=intent-1; genilink-workspace=workspace-1' },
  });
}

const baseIntent = {
  id: 'intent-1',
  sessionId: 'visitor-1',
  userId: null,
  targetUrl: 'https://example.com/',
  status: 'pending',
  projectId: null,
  analysisId: null,
  expiresAt: new Date(Date.now() + 60_000),
  session: { firstSource: 'landing', firstMedium: null, firstCampaign: null },
  project: null,
};

describe('POST /api/acquisition/activate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.intentFind.mockResolvedValue({ ...baseIntent });
    mocks.resolveWorkspaceId.mockResolvedValue('workspace-1');
    mocks.intentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.projectFindFirst.mockResolvedValue(null);
    mocks.projectFindUnique.mockResolvedValue(null);
    mocks.projectCreate.mockResolvedValue({ id: 'project-1', workspaceId: 'workspace-1' });
    mocks.resolveGuard.mockResolvedValue({ ok: true, ctx: { projectId: 'project-1' } });
    mocks.startAnalysis.mockResolvedValue({ data: { analysisId: 42 } });
    mocks.intentUpdate.mockResolvedValue({});
    mocks.sessionUpdate.mockResolvedValue({});
    mocks.userUpdate.mockResolvedValue({});
    mocks.eventUpsert.mockResolvedValue({});
  });

  it('creates one project and starts analysis on the server', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'diagnosis_started',
      analysisId: 42,
      nextUrl: '/website-analysis?from=acquisition',
    });
    expect(mocks.projectCreate).toHaveBeenCalledTimes(1);
    expect(mocks.startAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.intentUpdateMany).toHaveBeenCalledTimes(2);
    expect(response.headers.getSetCookie().join(';')).toContain('genilink-project=project-1');
  });

  it('does not retry an analysis whose upstream result is unknown', async () => {
    mocks.intentFind.mockResolvedValue({
      ...baseIntent,
      status: 'analysis_unknown',
      projectId: 'project-1',
      project: { id: 'project-1', workspaceId: 'workspace-1' },
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mocks.startAnalysis).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ code: 'ANALYSIS_RECONCILING' });
  });

  it('marks gateway failures for reconciliation instead of retrying', async () => {
    mocks.startAnalysis.mockResolvedValue({
      response: NextResponse.json({ error: 'Upstream timeout' }, { status: 504 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(mocks.intentUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'analysis_unknown' }),
    }));
  });
});
