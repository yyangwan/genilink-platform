import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn(), fetchUpstream: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectBrandReviewEvent: { findUnique: vi.fn() }, projectContextOutbox: { count: vi.fn() }, projectBrand: { findMany: vi.fn().mockResolvedValue([]) } } }));
vi.mock('@/lib/auth/service-jwt', () => ({ issueContentProjectJWT: vi.fn().mockResolvedValue('test-content-token') }));
vi.mock('@/lib/billing/guard', () => ({ requireBilling: vi.fn() }));
vi.mock('@/lib/content/contentos-internal-client', () => ({ lookupWorkflowByOperation: vi.fn() }));
vi.mock('@/lib/visibility/project-brand-bindings', () => ({ saveBrandBinding: vi.fn(), brandBindingHash: vi.fn().mockReturnValue('receipt-hash') }));
import { saveBrandBinding, brandBindingHash } from '@/lib/visibility/project-brand-bindings';
import { lookupWorkflowByOperation } from '@/lib/content/contentos-internal-client';
vi.mock('@/lib/billing/usage-reservations', () => ({ reserveContentGeneration: vi.fn(), commitUsageOperation: vi.fn(), releaseUsageOperation: vi.fn(), markPendingReconcile: vi.fn() }));
import { reserveContentGeneration, commitUsageOperation, releaseUsageOperation, markPendingReconcile } from '@/lib/billing/usage-reservations';
import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { issueContentProjectJWT } from '@/lib/auth/service-jwt';
import { GET, POST } from '@/app/api/integration/intelligence/route';

describe('project-scoped intelligence proxy', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(brandBindingHash).mockReturnValue('receipt-hash');
    vi.mocked(prisma.projectBrandReviewEvent.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0);
    vi.mocked(prisma.projectBrand.findMany).mockResolvedValue([]);
    vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'trusted-project', role: 'owner', workspaceId: 'workspace-1', session: { user: { id: 'user-1' } } } } as Awaited<ReturnType<typeof resolveGuard>>);
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { runs: [] } });
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'reserved', usageEventId: 'usage-1' });
    vi.mocked(commitUsageOperation).mockResolvedValue({ ok: true, status: 'committed', reason: 'ok' });
  });
  it('uses the verified project, ignoring caller path parameters', async () => {
    await GET(new NextRequest('http://localhost/api/integration/intelligence?projectId=attacker&view=runs'));
    expect(fetchUpstream).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'trusted-project' }),
      '/api/intelligence/projects/trusted-project/runs', expect.anything());
  });
  it('reads operations for the verified project without reserving model usage', async () => {
    await GET(new NextRequest('http://localhost/api/integration/intelligence?projectId=attacker&view=operations'));
    expect(resolveGuard).toHaveBeenCalledWith(expect.anything(), { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
    expect(fetchUpstream).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'trusted-project' }),
      '/api/intelligence/projects/trusted-project/operations', expect.anything());
    expect(reserveContentGeneration).not.toHaveBeenCalled();
  });
  it('does not proxy traversal in run or content IDs', async () => {
    const response = await GET(new NextRequest('http://localhost/api/integration/intelligence?view=detail&runId=../auth'));
    expect(response.status).toBe(400);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it('rejects an unknown view', async () => {
    const response = await GET(new NextRequest(`http://localhost/api/integration/intelligence?view=delete&runId=${'a'.repeat(32)}`));
    expect(response.status).toBe(400);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it('rejects viewer writes before accessing upstream', async () => {
    vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'trusted-project', role: 'viewer' } } as Awaited<ReturnType<typeof resolveGuard>>);
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ projectId: 'trusted-project', auditId: '1' }) }));
    expect(response.status).toBe(403);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it('preserves authentication/subscription rejection', async () => {
    vi.mocked(resolveGuard).mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) });
    expect((await GET(new NextRequest('http://localhost/api/integration/intelligence'))).status).toBe(401);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it('dispatches only a validated audit ID and returns accepted', async () => {
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ projectId: 'trusted-project', auditId: '123' }) }));
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), '/api/intelligence/audits/123/runs', expect.objectContaining({ method: 'POST' }));
  });
  const samplingRequest = () => new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({
    projectId: 'trusted-project', action: 'capture', promptIds: [1], platforms: ['qwen'], rounds: 3, surface: 'web', idempotencyKey: 'stable-key-123',
  }) });
  it('owns platform coverage and transport policy even when the caller sends overrides', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { audit_id: '12' } });
    const response = await POST(samplingRequest());
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), '/api/intelligence/projects/trusted-project/audits', expect.objectContaining({
      body: expect.objectContaining({ sampling: expect.objectContaining({
        platforms: ['qwen', 'deepseek', 'doubao', 'kimi', 'hunyuan'], surface: 'managed_v1',
      }) }),
    }));
  });
  it('accepts customer settings without transport fields and bounds the full platform total', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { audit_id: '12' } });
    const request = (rounds: number) => new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({
      action: 'capture', promptIds: Array.from({ length: 21 }, (_, i) => i + 1), rounds, idempotencyKey: 'managed-key-123',
    }) });
    expect((await POST(request(10))).status).toBe(400);
    expect(reserveContentGeneration).not.toHaveBeenCalled();
    expect((await POST(request(1))).status).toBe(202);
  });
  it('dispatches a bounded source retry without creating a new audit quota charge', async () => {
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({
      action: 'retrySource', auditId: '123', documentId: 'a'.repeat(32), idempotencyKey: 'retry-key-123',
    }) }));
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/sources/${'a'.repeat(32)}/retry`,
      expect.objectContaining({ body: { auditId: 123, idempotencyKey: 'retry-key-123' } }));
    expect(reserveContentGeneration).not.toHaveBeenCalled();
  });
  it('rejects unknown write actions', async () => {
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({
      action: 'delete', auditId: '123',
    }) }));
    expect(response.status).toBe(400);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it('forwards a versioned identity decision without accepting a caller reviewer', async () => {
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({
      action: 'reviewIdentity', runId: 'a'.repeat(32), entityId: 'b'.repeat(32), decision: 'confirmed', canonicalName: '云衡',
      reason: '核对企业名称和原文', expectedVersion: 0, idempotencyKey: 'identity-key-123', actorId: 'attacker',
    }) }));
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/runs/${'a'.repeat(32)}/identity-decisions`,
      expect.objectContaining({ body: { entityId: 'b'.repeat(32), decision: 'confirmed', canonicalName: '云衡', reason: '核对企业名称和原文', expectedVersion: 0, idempotencyKey: 'identity-key-123' } }));
  });
  it('limits approval to an investigation plan even if caller requests publication', async () => {
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({
      action: 'approveAction', actionId: 'a'.repeat(32), expectedRevision: 1, reason: '核对本组证据后批准计划', idempotencyKey: 'approval-key-123', scope: 'publication', actorId: 'attacker',
    }) }));
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/actions/${'a'.repeat(32)}/approve`,
      expect.objectContaining({ body: { expectedRevision: 1, reason: '核对本组证据后批准计划', idempotencyKey: 'approval-key-123', scope: 'investigation_plan' } }));
  });
  it('validates the factual time window and never forwards a caller statement', async () => {
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({
      action: 'approveFact', runId: 'a'.repeat(32), reviewId: 'b'.repeat(32), entityId: 'c'.repeat(32), scope: '中国大陆X系列产品', reason: '按原文核对范围期限', expectedVersion: 0,
      validFrom: '2026-10-14T00:00:00Z', validUntil: '2026-11-14T00:00:00Z', idempotencyKey: 'fact-key-123', statement: '伪造事实', actorId: 'attacker',
    }) }));
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/runs/${'a'.repeat(32)}/facts`,
      expect.objectContaining({ body: { reviewId: 'b'.repeat(32), entityId: 'c'.repeat(32), scope: '中国大陆X系列产品', reason: '按原文核对范围期限', expectedVersion: 0,
        validFrom: '2026-10-14T00:00:00Z', validUntil: '2026-11-14T00:00:00Z', idempotencyKey: 'fact-key-123' } }));
  });
  it('restricts formal draft approval to content editors', async () => {
    vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'trusted-project', role: 'member' } } as Awaited<ReturnType<typeof resolveGuard>>);
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ action: 'approveDraft' }) }));
    expect(response.status).toBe(403);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  it('prepares only the server-approved Brief using separate service audiences', async () => {
    vi.mocked(issueContentProjectJWT).mockResolvedValue('test-content-token');
    vi.mocked(resolveGuard).mockResolvedValue({ ok: true, ctx: { projectId: 'trusted-project', workspaceId: 'ws1', role: 'owner', serviceToken: 'test-visibility-token', session: { user: { id: 'user1' } } } } as Awaited<ReturnType<typeof resolveGuard>>);
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: 'prepared' } }), { status: 200 }));
    vi.stubGlobal('fetch', transport);
    try {
      const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ action: 'previewDraft', approvalId: 'a'.repeat(32), brief: { fake: true } }) }));
      expect(response.status).toBe(200);
      expect(transport).toHaveBeenCalledWith(expect.stringContaining('/api/evidence-briefs/preview'), expect.objectContaining({
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-content-token', 'X-Visibility-Authorization': 'Bearer test-visibility-token' }, body: JSON.stringify({ approvalId: 'a'.repeat(32) }),
      }));
    } finally { vi.unstubAllGlobals(); }
  });
  it('reserves an audit once through the durable usage ledger', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { audit_id: '123', expected_samples: 3 } });
    expect((await POST(samplingRequest())).status).toBe(202);
    expect(reserveContentGeneration).toHaveBeenCalledWith(expect.objectContaining({ feature: 'visibility_audit', workspaceId: 'workspace-1' }));
    expect(commitUsageOperation).toHaveBeenCalledOnce();
  });
  it('keeps reservation on an ambiguous upstream timeout', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ response: NextResponse.json({ error: 'timeout' }, { status: 504 }) });
    expect((await POST(samplingRequest())).status).toBe(504);
    expect(markPendingReconcile).toHaveBeenCalledOnce();
    expect(releaseUsageOperation).not.toHaveBeenCalled();
  });
  it('does not resurrect a released quota reservation', async () => {
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'replay', usageEventId: 'usage-1', status: 'released' });
    expect((await POST(samplingRequest())).status).toBe(409);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });
  const generate = () => new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ action: 'generateDraft', approvalId: 'a'.repeat(32), brief: { fake: true } }) });
  const authority = { projectId: 'trusted-project', approval: { id: 'a'.repeat(32) }, execution: { mode: 'generate_draft', channel: 'wechat' } };
  it('binds duplicate requests to the same quota operation and sends only IDs', async () => {
    vi.stubEnv('BILLING_DISABLED', 'false'); vi.mocked(fetchUpstream).mockResolvedValue({ data: authority });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: { id: 'wf-1' } }), { status: 202 })));
    expect((await POST(generate())).status).toBe(202); expect((await POST(generate())).status).toBe(202);
    const [first, second] = vi.mocked(reserveContentGeneration).mock.calls;
    expect(first[0].operationId).toBe(second[0].operationId);
    expect(first[0].metadata).toEqual({ source: 'evidence_v2', projectId: 'trusted-project', approvalId: 'a'.repeat(32) });
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({ approvalId: 'a'.repeat(32), usageOperationId: first[0].operationId });
    expect(commitUsageOperation).not.toHaveBeenCalled();
  });
  it('rejects manual execution before reserving quota', async () => {
    vi.stubEnv('BILLING_DISABLED', 'false'); vi.mocked(fetchUpstream).mockResolvedValue({ data: { ...authority, execution: { mode: 'manual_task', channel: 'website' } } });
    expect((await POST(generate())).status).toBe(422); expect(reserveContentGeneration).not.toHaveBeenCalled();
  });
  it('keeps the reservation if create times out or a rejected request was already accepted', async () => {
    vi.stubEnv('BILLING_DISABLED', 'false'); vi.mocked(fetchUpstream).mockResolvedValue({ data: authority });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(new Response('{}', { status: 409 })));
    vi.mocked(lookupWorkflowByOperation).mockResolvedValue({ found: true, usageStatus: 'reserved', workflowStatus: 'queued' });
    expect((await POST(generate())).status).toBe(503); expect((await POST(generate())).status).toBe(503);
    expect(releaseUsageOperation).not.toHaveBeenCalled(); expect(markPendingReconcile).toHaveBeenCalledTimes(2);
  });
  it('releases rejected creation only after confirming no workflow exists', async () => {
    vi.stubEnv('BILLING_DISABLED', 'false'); vi.mocked(fetchUpstream).mockResolvedValue({ data: authority });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 409 })));
    vi.mocked(lookupWorkflowByOperation).mockResolvedValue({ found: false });
    expect((await POST(generate())).status).toBe(409); expect(releaseUsageOperation).toHaveBeenCalledOnce();
  });
  it('uses project-scoped cohort and result paths and rejects traversal', async () => {
    expect((await GET(new NextRequest('http://localhost/api/integration/intelligence?view=cohorts'))).status).toBe(200);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), '/api/intelligence/projects/trusted-project/cohorts', expect.anything());
    expect((await GET(new NextRequest('http://localhost/api/integration/intelligence?view=measurementResults&cohortId=../other'))).status).toBe(400);
  });
  it('freezes a cohort without browser-supplied sampling or actor overrides', async () => {
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ action: 'createCohort', baselineRunId: 'a'.repeat(32), entityIds: ['b'.repeat(32)], title: '品牌固定复测方案', idempotencyKey: 'cohort-key-123', actorId: 'attacker', slots: [] }) }));
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), '/api/intelligence/projects/trusted-project/cohorts', expect.objectContaining({ body: { baselineRunId: 'a'.repeat(32), entityIds: ['b'.repeat(32)], title: '品牌固定复测方案', idempotencyKey: 'cohort-key-123' } }));
    expect(reserveContentGeneration).not.toHaveBeenCalled();
  });
  const retestRequest = () => new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ action: 'startRetest', cohortId: 'a'.repeat(32), idempotencyKey: 'retest-key-123' }) });
  it('reserves one audit operation for frozen retest and preserves uncertainty', async () => {
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { audit_id: '100' } });
    expect((await POST(retestRequest())).status).toBe(202);
    expect(reserveContentGeneration).toHaveBeenCalledWith(expect.objectContaining({ feature: 'visibility_audit', metadata: { projectId: 'trusted-project', cohortId: 'a'.repeat(32), samplingVersion: 2 } }));
    const operation = vi.mocked(reserveContentGeneration).mock.calls[0][0].operationId;
    vi.mocked(fetchUpstream).mockResolvedValue({ response: NextResponse.json({ error: 'timeout' }, { status: 504 }) });
    expect((await POST(retestRequest())).status).toBe(504);
    expect(vi.mocked(reserveContentGeneration).mock.calls[1][0].operationId).toBe(operation);
    expect(markPendingReconcile).toHaveBeenCalledOnce(); expect(releaseUsageOperation).not.toHaveBeenCalled();
  });
  it('records human publication metadata without publish authorization and rejects unsafe links', async () => {
    const value = { action: 'recordAsset', actionId: 'a'.repeat(32), url: 'https://example.com/article', channel: 'website', contentHash: 'b'.repeat(64), publishedAt: '2026-10-14T00:00:00Z', reason: '负责人核对已发布正文', idempotencyKey: 'asset-key-123', publicationAuthorized: true };
    const req = (body: unknown) => new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify(body) });
    expect((await POST(req(value))).status).toBe(202);
    const call = vi.mocked(fetchUpstream).mock.calls[0][2];
    expect(call?.body).not.toHaveProperty('publicationAuthorized'); expect(reserveContentGeneration).not.toHaveBeenCalled();
    expect((await POST(req({ ...value, url: 'javascript:alert(1)' }))).status).toBe(400);
  });
  it('creates a manual task with separate service audiences and no quota reservation', async () => {
    vi.mocked(issueContentProjectJWT).mockResolvedValue('fake-content-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'task' } }), { status: 202 })));
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ action: 'createManualTask', approvalId: 'a'.repeat(32), actorId: 'attacker', brief: {} }) }));
    expect(response.status).toBe(202); expect(reserveContentGeneration).not.toHaveBeenCalled(); expect(commitUsageOperation).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/evidence-briefs/manual-tasks'), expect.objectContaining({ body: JSON.stringify({ action: 'create', approvalId: 'a'.repeat(32) }), headers: expect.objectContaining({ Authorization: 'Bearer fake-content-token', 'X-Visibility-Authorization': expect.stringContaining('Bearer ') }) }));
  });
  it('whitelists manual transitions and blocks unsafe delivery links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 202 })));
    const value = { action: 'updateManualTask', taskAction: 'complete', taskId: 'a'.repeat(32), expectedVersion: 2, idempotencyKey: 'manual-key-123', reason: '复核后完成内容交付', deliveryUrl: 'https://example.com/draft', publicationAllowed: true };
    const req = (body: unknown) => new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify(body) });
    expect((await POST(req(value))).status).toBe(202);
    expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)).not.toHaveProperty('publicationAllowed');
    expect((await POST(req({ ...value, deliveryUrl: 'javascript:alert(1)' }))).status).toBe(400);
    expect(reserveContentGeneration).not.toHaveBeenCalled();
  });
  it('sends a versioned alias decision without accepting caller identity or rewriting raw entities', async () => {
    const value = { action: 'reviewAlias', runId: 'a'.repeat(32), sourceEntityId: 'b'.repeat(32), targetEntityId: 'c'.repeat(32), decision: 'merge', reason: '已核对中英文名称为同一主体', expectedVersion: 0, idempotencyKey: 'alias-key-123', actorId: 'attacker' };
    const response = await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify(value) }));
    expect(response.status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/runs/${value.runId}/aliases`, expect.objectContaining({ body: { sourceEntityId: value.sourceEntityId, targetEntityId: value.targetEntityId, decision: 'merge', reason: value.reason, expectedVersion: 0, idempotencyKey: value.idempotencyKey } }));
    expect(reserveContentGeneration).not.toHaveBeenCalled();
  });
  it('binds a single occurrence without caller proof or actor overrides', async () => {
    const value = { action: 'reviewMentionBinding', runId: 'a'.repeat(32), mentionId: 'b'.repeat(32), targetEntityId: 'c'.repeat(32), decision: 'assign', reason: '核对上下文后确认此片段主体', expectedVersion: 0, idempotencyKey: 'mention-key-123', actorId: 'attacker', quote: 'forged' };
    const req = (body: unknown) => new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify(body) });
    expect((await POST(req(value))).status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/runs/${value.runId}/mention-bindings`, expect.objectContaining({ body: { mentionId: value.mentionId, targetEntityId: value.targetEntityId, decision: 'assign', reason: value.reason, expectedVersion: 0, idempotencyKey: value.idempotencyKey } }));
    expect((await POST(req({ ...value, decision: 'reset' }))).status).toBe(400);
    expect(reserveContentGeneration).not.toHaveBeenCalled();
  });

  it('creates a qualified split subject without accepting kind or identity authority overrides', async () => {
    const value = { action: 'reviewMentionBinding', runId: 'a'.repeat(32), mentionId: 'b'.repeat(32), decision: 'split', newEntityName: '云衡（工业设备品牌）', reason: '已核对该上下文对应独立主体', expectedVersion: 0, idempotencyKey: 'split-key-123', entityKind: 'person', actorId: 'attacker', publicationAllowed: true };
    const req = (body: unknown) => new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify(body) });
    expect((await POST(req(value))).status).toBe(202);
    expect(fetchUpstream).toHaveBeenCalledWith(expect.anything(), `/api/intelligence/runs/${value.runId}/mention-bindings`, expect.objectContaining({ body: { mentionId: value.mentionId, newEntityName: value.newEntityName, decision: 'split', reason: value.reason, expectedVersion: 0, idempotencyKey: value.idempotencyKey } }));
    expect((await POST(req({ ...value, targetEntityId: 'c'.repeat(32) }))).status).toBe(400);
    expect((await POST(req({ ...value, newEntityName: '  ' }))).status).toBe(400);
    expect(reserveContentGeneration).not.toHaveBeenCalled();
  });

  it('blocks evidence generation and sampling while a committed brand change awaits synchronization', async () => {
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    const request = new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ action: 'generateDraft', approvalId: 'a'.repeat(32) }) });
    expect((await POST(request)).status).toBe(409);
    expect((await POST(samplingRequest())).status).toBe(409);
    expect((await GET(new NextRequest(`http://localhost/api/integration/intelligence?view=evidenceBrief&approvalId=${'a'.repeat(32)}`))).status).toBe(409);
    expect(fetchUpstream).not.toHaveBeenCalled(); expect(reserveContentGeneration).not.toHaveBeenCalled();
  });

  it('takes binding proof versions only from the scoped identity service, not caller data', async () => {
    const entityId = 'c'.repeat(32);
    vi.mocked(fetchUpstream).mockResolvedValue({ data: { id: entityId, version: 3 } });
    vi.mocked(saveBrandBinding).mockResolvedValue({ id: 'event' } as never);
    const input = { action: 'bindProjectBrand', brandId: 'brand', entityId, analysisRole: 'registered', reason: '已核对品牌与实体对应关系', expectedVersion: 0, idempotencyKey: 'binding-key-123' };
    expect((await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify({ ...input, actorId: 'forged', identityVersion: 999 }) }))).status).toBe(202);
    expect(saveBrandBinding).toHaveBeenCalledWith(expect.anything(), { brandId: 'brand', entityId, analysisRole: 'registered', reason: input.reason, expectedVersion: 0, idempotencyKey: input.idempotencyKey }, 3);
  });
  it('replays a committed binding receipt without requiring the identity service again', async () => {
    vi.mocked(prisma.projectBrandReviewEvent.findUnique).mockResolvedValue({ id: 'event', requestHash: 'receipt-hash' } as never);
    const input = { action: 'bindProjectBrand', brandId: 'brand', entityId: null, analysisRole: 'comparison', reason: '仅作为本项目的对比主体', expectedVersion: 0, idempotencyKey: 'binding-key-123' };
    expect((await POST(new NextRequest('http://localhost/api/integration/intelligence', { method: 'POST', body: JSON.stringify(input) }))).status).toBe(202);
    expect(fetchUpstream).not.toHaveBeenCalled(); expect(saveBrandBinding).not.toHaveBeenCalled();
  });

});
