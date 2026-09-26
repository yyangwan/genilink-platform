import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  intentFindMany: vi.fn(),
  intentUpdateMany: vi.fn(),
  intentCount: vi.fn(),
  memberFind: vi.fn(),
  eventUpsert: vi.fn(),
  transaction: vi.fn(),
  issueJwt: vi.fn(),
  commitUsage: vi.fn(),
  startAnalysis: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    acquisitionIntent: {
      findMany: mocks.intentFindMany,
      updateMany: mocks.intentUpdateMany,
      count: mocks.intentCount,
    },
    workspaceMember: { findFirst: mocks.memberFind },
    funnelEvent: { upsert: mocks.eventUpsert },
    $transaction: mocks.transaction,
  },
}));
vi.mock('@/lib/auth/service-jwt', () => ({ issueVisibilityProjectJWT: mocks.issueJwt }));
vi.mock('@/lib/billing/usage-reservations', () => ({ commitUsageOperation: mocks.commitUsage }));
vi.mock('@/lib/product-website/start-analysis', () => ({
  startProductWebsiteAnalysis: mocks.startAnalysis,
  websiteAnalysisOperationId: (key: string) => `website-analysis:${key}`,
}));

import { reconcileAcquisitionAnalyses } from '@/lib/marketing/maintenance';

const unknownIntent = {
  id: 'intent-1',
  sessionId: 'session-1',
  idempotencyKey: 'request-key-123456',
  targetUrl: 'https://example.com/',
  userId: 'user-1',
  projectId: 'project-1',
  session: { firstSource: 'landing', firstMedium: null, firstCampaign: null },
  project: { workspaceId: 'workspace-1' },
};

describe('acquisition analysis recovery', () => {
  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.intentFindMany.mockResolvedValueOnce([unknownIntent]).mockResolvedValueOnce([]);
    mocks.intentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.intentCount.mockResolvedValue(0);
    mocks.memberFind.mockResolvedValue({ role: 'owner' });
    mocks.issueJwt.mockResolvedValue('jwt');
    mocks.commitUsage.mockResolvedValue({ ok: true });
    mocks.eventUpsert.mockResolvedValue({});
    mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
  });

  it('binds an analysis found by the upstream request key without creating another task', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ analysisId: 42 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ));

    const result = await reconcileAcquisitionAnalyses();

    expect(result.decisions).toContainEqual({ intentId: 'intent-1', action: 'analysis_recovered' });
    expect(mocks.startAnalysis).not.toHaveBeenCalled();
    expect(mocks.commitUsage).toHaveBeenCalledWith('website-analysis:request-key-123456');
    expect(mocks.intentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'diagnosis_started', analysisId: 42 }),
    }));
  });

  it('safely retries creation with the same key when lookup proves no task exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    mocks.startAnalysis.mockResolvedValue({ data: { analysisId: 43 } });

    const result = await reconcileAcquisitionAnalyses();

    expect(result.decisions).toContainEqual({ intentId: 'intent-1', action: 'analysis_recovered' });
    expect(mocks.startAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1', workspaceId: 'workspace-1' }),
      { requestedUrl: 'https://example.com/', idempotencyKey: 'request-key-123456' },
    );
  });
});
