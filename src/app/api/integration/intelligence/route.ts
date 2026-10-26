import { validQuestionContexts } from '@/lib/visibility/question-context';
import { cohortRequestSchema } from '@/lib/visibility/measurement-request';
import { saveBrandBinding, brandBindingHash, type BrandBindingInput } from '@/lib/visibility/project-brand-bindings';
import { ContextConflict, freezeProjectContext, deliverProjectContext } from '@/lib/visibility/project-context';
import { NextRequest, NextResponse } from 'next/server';
import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db';
import { reserveContentGeneration, commitUsageOperation, releaseUsageOperation, markPendingReconcile } from '@/lib/billing/usage-reservations';
import { planLimitResponse } from '@/lib/billing/usage';
import { issueContentProjectJWT } from '@/lib/auth/service-jwt';
import { requireBilling } from '@/lib/billing/guard';
import { requestHash as hashRequest } from '@/lib/billing/idempotency';
import { lookupWorkflowByOperation } from '@/lib/content/contentos-internal-client';
import { CAPTURE_PLATFORMS } from '@/lib/visibility/capture-policy';
import { evidenceDraftReady } from '@/lib/content/evidence-capabilities';

const validId = (id: string | null): id is string => !!id && /^[a-f0-9]{32}$/.test(id);
const badRequest = () => NextResponse.json({ error: '无效的证据查询参数' }, { status: 400 });

export async function GET(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  const params = req.nextUrl.searchParams;
  const view = params.get('view') || 'runs';
  if (view === 'manualTasks' || view === 'evidenceCapabilities') {
    try { await requireBilling(guard.ctx.session.user.id, guard.ctx.workspaceId, 'content'); }
    catch { return NextResponse.json({ error: '需要内容服务订阅' }, { status: 403 }); }
    const taskId = params.get('taskId');
    if (taskId && !validId(taskId)) return badRequest();
    const token = await issueContentProjectJWT({ userId: guard.ctx.session.user.id, workspaceId: guard.ctx.workspaceId, projectId: guard.ctx.projectId, role: guard.ctx.role });
    const target = view === 'evidenceCapabilities' ? '/api/capabilities/evidence-briefs' : `/api/evidence-briefs/manual-tasks${taskId ? `?taskId=${taskId}` : ''}`;
    try {
      const response = await fetch(`${process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003'}${target}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: 'no-store' });
      return NextResponse.json(await response.json(), { status: response.status, headers: { 'Cache-Control': 'no-store' } });
    } catch { return NextResponse.json({ error: '人工任务服务暂不可用' }, { status: 503 }); }
  }
  if (view === 'brandBindings') {
    const rows = await prisma.projectBrand.findMany({ where: { projectId: guard.ctx.projectId, brand: { workspaceId: guard.ctx.workspaceId, deletedAt: null } }, include: { brand: true }, orderBy: { brandId: 'asc' } });
    const context = await prisma.projectIntelligenceContext.findUnique({ where: { projectId: guard.ctx.projectId } });
    return NextResponse.json({ version: context?.version || 0, brands: rows.map(row => ({ brandId: row.brandId, name: row.brand.name, isCompetitor: row.brand.isCompetitor, analysisRole: row.analysisRole, entityId: row.entityId, identityVersion: row.identityVersion })) });
  }
  if (view === 'brandContext') {
    const context = await prisma.projectIntelligenceContext.findUnique({ where: { projectId: guard.ctx.projectId } });
    const pending = await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } });
    const retry = await prisma.projectContextOutbox.findFirst({ where: { projectId: guard.ctx.projectId, deliveredAt: null }, orderBy: { version: 'asc' }, select: { version: true, attempts: true, nextAttemptAt: true, lastErrorCode: true } });
    return NextResponse.json({ context, pending, retry });
  }
  let path: string;
  if (view === 'cohorts' || view === 'assets' || view === 'aliases' || view === 'mention-bindings') {
    path = `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/${view}`;
  } else if (view === 'retests' || view === 'measurementResults') {
    const cohortId = params.get('cohortId');
    if (!validId(cohortId)) return badRequest();
    path = `/api/intelligence/cohorts/${cohortId}/${view === 'retests' ? 'retests' : 'results'}`;
  } else if (view === 'runs' || view === 'jobs' || view === 'operations') {
    path = `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/${view}`;
  } else if (view === 'prompts') {
    path = `/api/prompts?project_id=${encodeURIComponent(guard.ctx.projectId)}`;
  } else if (view === 'facts') {
    path = `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/facts`;
  } else if (view === 'evidenceBrief') {
    if (await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } })) return NextResponse.json({ error: '品牌配置尚未同步，请先完成同步' }, { status: 409 });
    const approvalId = params.get('approvalId');
    if (!validId(approvalId)) return badRequest();
    path = `/api/intelligence/draft-approvals/${approvalId}/brief`;
  } else if (view === 'capture') {
    const auditId = params.get('auditId');
    if (!auditId || !/^[1-9][0-9]{0,17}$/.test(auditId)) return badRequest();
    path = `/api/intelligence/audits/${auditId}/capture`;
  } else {
    const runId = params.get('runId');
    if (!validId(runId)) return badRequest();
    path = `/api/intelligence/runs/${runId}`;
    if (view === 'content') {
      const kind = params.get('ownerKind');
      const ownerId = params.get('ownerId');
      const offset = params.get('offset') || '0';
      if (!kind || !['answer', 'citation', 'snapshot'].includes(kind) || !ownerId ||
          !/^(?:[a-f0-9]{32}|[0-9]{1,18})$/.test(ownerId) || !/^[0-9]{1,8}$/.test(offset)) return badRequest();
      path += `/content?${new URLSearchParams({ owner_kind: kind, owner_id: ownerId, offset })}`;
    } else if (view === 'actions') path += '/actions';
    else if (view === 'evaluationCohort') path += '/evaluation-cohort';
    else if (view === 'scenarios') path += '/scenarios';
    else if (view !== 'detail') return badRequest();
  }
  const result = await fetchUpstream(guard.ctx, path, { errorMessage: '证据分析服务暂不可用' });
  if ('response' in result) return result.response;
  return NextResponse.json(result.data);
}

export async function POST(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  if (!['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role)) {
    return NextResponse.json({ error: '需要项目写入权限' }, { status: 403 });
  }
  let body: { contexts?: unknown; baseHash?: unknown; decisions?: unknown; brandId?: unknown; analysisRole?: unknown; newEntityName?: unknown; mentionId?: unknown; sourceEntityId?: unknown; targetEntityId?: unknown; taskId?: unknown; taskAction?: unknown; deliveryUrl?: unknown; cohortId?: unknown; comparisonMode?: unknown; brandTargetIds?: unknown; promptHashes?: unknown; baselineRunId?: unknown; followupRunId?: unknown; entityIds?: unknown; url?: unknown; contentHash?: unknown; publishedAt?: unknown; auditId?: unknown; documentId?: unknown; runId?: unknown; approvalId?: unknown; factIds?: unknown; factsScopeReviewed?: unknown; channel?: unknown; title?: unknown; expiresAt?: unknown; evidenceId?: unknown; reviewId?: unknown; factId?: unknown; relation?: unknown; sourceQuote?: unknown; scope?: unknown; validFrom?: unknown; validUntil?: unknown; actionId?: unknown; diagnosisId?: unknown; expectedRevision?: unknown; entityId?: unknown; decision?: unknown; canonicalName?: unknown; reason?: unknown; expectedVersion?: unknown; action?: unknown; promptIds?: unknown; platforms?: unknown; rounds?: unknown; surface?: unknown; idempotencyKey?: unknown };
  try { body = await req.json(); } catch { return badRequest(); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest();
  const requiresCurrentContext = ['generateDraft', 'approveDraft', 'previewDraft', 'approveFact', 'createAction', 'approveAction', 'createCohort', 'compareCohort', 'startRetest', 'capture', 'analyze', 'createManualTask'].includes(String(body.action)) || body.action === undefined || body.action === 'updateManualTask' && body.taskAction !== 'cancel';
  if (requiresCurrentContext && await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } })) return NextResponse.json({ error: '品牌配置尚未同步，请先完成同步后再分析或使用材料' }, { status: 409 });
  if (body.action === 'reviewEvaluationCohort') {
    if (body.contexts !== undefined && !validQuestionContexts(body.contexts)) return badRequest();
    if (typeof body.runId !== 'string' || !validId(body.runId) ||
        typeof body.baseHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.baseHash) ||
        !body.decisions || typeof body.decisions !== 'object' || Array.isArray(body.decisions) ||
        Object.keys(body.decisions).length < 1 || Object.keys(body.decisions).length > 100 ||
        !Object.entries(body.decisions).every(([key, value]) => /^[a-f0-9]{64}$/.test(key) && ['eligible', 'excluded', 'needs_review'].includes(String(value))) ||
        typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000 ||
        !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 ||
        typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
    const result = await fetchUpstream(guard.ctx, `/api/intelligence/runs/${body.runId}/evaluation-cohort/review`, {
      method: 'POST', body: { baseHash: body.baseHash, decisions: body.decisions, ...(body.contexts !== undefined ? { contexts: body.contexts } : {}), reason: body.reason,
        expectedVersion: body.expectedVersion, idempotencyKey: body.idempotencyKey },
      errorMessage: '评分范围审核尚未确认，请使用相同请求编号重试',
    });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'bindProjectBrand') {
    if (typeof body.brandId !== 'string' || !body.brandId || body.brandId.length > 50 || !['registered', 'comparison'].includes(String(body.analysisRole)) || body.entityId !== null && (typeof body.entityId !== 'string' || !validId(body.entityId)) ||
        typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000 || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 || typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
    const input: BrandBindingInput = { brandId: body.brandId, entityId: body.entityId as string | null, analysisRole: body.analysisRole as BrandBindingInput['analysisRole'], reason: body.reason, expectedVersion: Number(body.expectedVersion), idempotencyKey: body.idempotencyKey };
    try {
      const prior = await prisma.projectBrandReviewEvent.findUnique({ where: { projectId_idempotencyKey: { projectId: guard.ctx.projectId, idempotencyKey: input.idempotencyKey } } });
      if (prior) { if (prior.requestHash !== brandBindingHash(guard.ctx, input)) throw new ContextConflict('操作编号已用于不同请求'); return NextResponse.json({ event: prior }, { status: 202 }); }
      let proofVersion: number | null = null;
      if (input.entityId) {
        const proof = await fetchUpstream(guard.ctx, `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/entities/${input.entityId}/binding-proof`);
        if ('response' in proof) return proof.response;
        const identity = proof.data as { id?: string; version?: number };
        if (identity?.id !== input.entityId || !Number.isSafeInteger(identity?.version) || Number(identity?.version) < 1) throw new ContextConflict('实体身份凭据无效');
        proofVersion = Number(identity.version);
      }
      const event = await saveBrandBinding(guard.ctx, input, proofVersion);
      return NextResponse.json({ event, syncPending: true }, { status: 202 });
    } catch (error) { return NextResponse.json({ error: error instanceof ContextConflict ? error.message : '品牌绑定尚未确认，请使用相同编号重试' }, { status: error instanceof ContextConflict ? 409 : 503 }); }
  }
  if (body.action === 'syncBrandContext') {
    if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0) return badRequest();
    try {
      const context = await freezeProjectContext(guard.ctx, Number(body.expectedVersion));
      const failure = await deliverProjectContext(guard.ctx);
      if (failure) return failure;
      return NextResponse.json({ context, pending: await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } }) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof ContextConflict ? error.message : '同步尚未确认，请重试' }, { status: error instanceof ContextConflict ? 409 : 503 });
    }
  }
  if (body.action === 'reviewMentionBinding') {
    if (typeof body.runId !== 'string' || !validId(body.runId) || typeof body.mentionId !== 'string' || !validId(body.mentionId) ||
        !['assign', 'reset', 'split'].includes(String(body.decision)) || body.decision === 'assign' && (typeof body.targetEntityId !== 'string' || !validId(body.targetEntityId)) ||
        body.decision !== 'assign' && body.targetEntityId !== undefined || body.decision === 'split' && (typeof body.newEntityName !== 'string' || body.newEntityName.trim().length < 2 || body.newEntityName.length > 200) || body.decision !== 'split' && body.newEntityName !== undefined || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 ||
        typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000 || typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
    const result = await fetchUpstream(guard.ctx, `/api/intelligence/runs/${body.runId}/mention-bindings`, { method: 'POST',
      body: { mentionId: body.mentionId, ...(body.decision === 'assign' ? { targetEntityId: body.targetEntityId } : {}), ...(body.decision === 'split' ? { newEntityName: body.newEntityName } : {}), decision: body.decision,
        reason: body.reason, expectedVersion: body.expectedVersion, idempotencyKey: body.idempotencyKey }, errorMessage: '片段归属操作失败，请核对主体、原文、名称和版本' });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'reviewAlias') {
    if (typeof body.runId !== 'string' || !validId(body.runId) || typeof body.sourceEntityId !== 'string' || !validId(body.sourceEntityId) ||
        !['merge', 'unlink'].includes(String(body.decision)) || body.decision === 'merge' && (typeof body.targetEntityId !== 'string' || !validId(body.targetEntityId)) ||
        body.decision === 'unlink' && body.targetEntityId !== undefined || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 ||
        typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000 || typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
    const result = await fetchUpstream(guard.ctx, `/api/intelligence/runs/${body.runId}/aliases`, { method: 'POST',
      body: { sourceEntityId: body.sourceEntityId, ...(body.decision === 'merge' ? { targetEntityId: body.targetEntityId } : {}), decision: body.decision,
        reason: body.reason, expectedVersion: body.expectedVersion, idempotencyKey: body.idempotencyKey }, errorMessage: '别名操作失败，请核对实体身份、映射版本和归并依据' });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'createManualTask' || body.action === 'updateManualTask') {
    try { await requireBilling(guard.ctx.session.user.id, guard.ctx.workspaceId, 'content'); }
    catch { return NextResponse.json({ error: '需要内容服务订阅' }, { status: 403 }); }
    let payload: object;
    if (body.action === 'createManualTask') {
      if (typeof body.approvalId !== 'string' || !validId(body.approvalId)) return badRequest();
      payload = { action: 'create', approvalId: body.approvalId };
    } else {
      if (typeof body.taskId !== 'string' || !validId(body.taskId) || !['start', 'complete', 'cancel'].includes(String(body.taskAction)) ||
          !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1 || typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey) ||
          typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000 ||
          body.deliveryUrl !== undefined && (body.taskAction !== 'complete' || typeof body.deliveryUrl !== 'string' || body.deliveryUrl.length > 4096)) return badRequest();
      if (body.deliveryUrl) { try { const url = new URL(String(body.deliveryUrl)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return badRequest(); } catch { return badRequest(); } }
      payload = { action: body.taskAction, taskId: body.taskId, expectedVersion: body.expectedVersion, reason: body.reason, idempotencyKey: body.idempotencyKey,
        ...(body.deliveryUrl !== undefined ? { deliveryUrl: body.deliveryUrl } : {}) };
    }
    const token = await issueContentProjectJWT({ userId: guard.ctx.session.user.id, workspaceId: guard.ctx.workspaceId, projectId: guard.ctx.projectId, role: guard.ctx.role });
    try {
      const response = await fetch(`${process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003'}/api/evidence-briefs/manual-tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Visibility-Authorization': `Bearer ${guard.ctx.serviceToken}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), cache: 'no-store',
      });
      return NextResponse.json(await response.json(), { status: response.status });
    } catch { return NextResponse.json({ error: '人工任务受理结果尚待确认，请刷新列表或沿用原审批和操作编号重试' }, { status: 503 }); }
  }
  if (body.action === 'createCohort' || body.action === 'compareCohort' || body.action === 'recordAsset' || body.action === 'startRetest') {
    let path: string;
    let payload: object;
    if (body.action === 'compareCohort') {
      if (typeof body.cohortId !== 'string' || !validId(body.cohortId) || typeof body.followupRunId !== 'string' || !validId(body.followupRunId)) return badRequest();
      path = `/api/intelligence/cohorts/${body.cohortId}/results`; payload = { followupRunId: body.followupRunId };
    } else {
      if (typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
      if (body.action === 'createCohort') {
        const frozen = cohortRequestSchema.safeParse({ ...body, comparisonMode: body.comparisonMode === undefined ? 'inferential_v1' : body.comparisonMode });
        if (!frozen.success) return badRequest();
        path = `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/cohorts`;
        payload = frozen.data;
      } else if (body.action === 'recordAsset') {
        if (typeof body.actionId !== 'string' || !validId(body.actionId) || typeof body.url !== 'string' || body.url.length > 4096 ||
            !['wechat', 'weibo', 'xiaohongshu', 'douyin', 'website', 'zhihu', 'toutiao'].includes(String(body.channel)) ||
            typeof body.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(body.contentHash) || typeof body.publishedAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(body.publishedAt) || !Number.isFinite(Date.parse(body.publishedAt)) ||
            typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000) return badRequest();
        try { const url = new URL(body.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return badRequest(); } catch { return badRequest(); }
        path = `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/assets`;
        payload = { actionId: body.actionId, url: body.url, channel: body.channel, contentHash: body.contentHash, publishedAt: body.publishedAt, reason: body.reason, idempotencyKey: body.idempotencyKey };
      } else {
        if (typeof body.cohortId !== 'string' || !validId(body.cohortId)) return badRequest();
        const operationId = 'visibility-retest-' + createHash('sha256').update(JSON.stringify([guard.ctx.workspaceId, guard.ctx.projectId, body.cohortId, body.idempotencyKey])).digest('hex');
        const reservation = await reserveContentGeneration({ userId: guard.ctx.session.user.id, workspaceId: guard.ctx.workspaceId, operationId,
          requestHash: hashRequest({ cohortId: body.cohortId, idempotencyKey: body.idempotencyKey }), feature: 'visibility_audit', metadata: { projectId: guard.ctx.projectId, cohortId: body.cohortId, samplingVersion: 2 } });
        if (reservation.type === 'limit') return planLimitResponse(reservation.error);
        if (reservation.type === 'conflict' || (reservation.type === 'replay' && reservation.status === 'released')) return NextResponse.json({ error: '该复测编号已结束或冲突，请使用新的复测编号' }, { status: 409 });
        const result = await fetchUpstream(guard.ctx, `/api/intelligence/cohorts/${body.cohortId}/retests`, { method: 'POST', body: { idempotencyKey: body.idempotencyKey }, timeoutMs: 30_000, errorMessage: '复测受理结果尚待确认，请沿用原请求编号重试' });
        if ('response' in result) { if (result.response.status >= 500) await markPendingReconcile(operationId); else await releaseUsageOperation(operationId, 'retest_validation_failed'); return result.response; }
        if (!result.data || typeof (result.data as { audit_id?: unknown }).audit_id !== 'string') { await markPendingReconcile(operationId); return NextResponse.json({ error: '复测受理结果尚待确认' }, { status: 502 }); }
        const committed = await commitUsageOperation(operationId);
        if (!committed.ok) { await markPendingReconcile(operationId); return NextResponse.json({ error: '复测已受理，额度状态待确认，请沿用原请求编号重试' }, { status: 502 }); }
        return NextResponse.json(result.data, { status: 202 });
      }
    }
    const result = await fetchUpstream(guard.ctx, path, { method: 'POST', body: payload, errorMessage: '复测或发布记录操作失败，请核对项目、样本及版本' });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'generateDraft') {
    if (typeof body.approvalId !== 'string' || !validId(body.approvalId)) return badRequest();
    if (process.env.BILLING_DISABLED === 'true') return NextResponse.json({ error: '证据生成需要启用持久额度账本' }, { status: 503 });
    try { await requireBilling(guard.ctx.session.user.id, guard.ctx.workspaceId, 'content'); }
    catch { return NextResponse.json({ error: '需要内容服务订阅' }, { status: 403 }); }
    const operationId = 'evidence-draft:' + createHash('sha256').update(JSON.stringify([guard.ctx.workspaceId, guard.ctx.projectId, body.approvalId])).digest('hex');
    const serviceBody = { approvalId: body.approvalId, usageOperationId: operationId };
    // Validate the channel before quota reservation; authoritative facts are reread by ContentOS.
    const authority = await fetchUpstream(guard.ctx, `/api/intelligence/draft-approvals/${body.approvalId}/brief`, { errorMessage: '草稿授权已失效或暂不可用' });
    if ('response' in authority) return authority.response;
    const brief = authority.data as { schemaVersion?: number; projectId?: string; approval?: { id?: string }; execution?: { mode?: string; channel?: string } };
    if (!brief || brief.schemaVersion !== 3 || brief.projectId !== guard.ctx.projectId || brief.approval?.id !== body.approvalId) return NextResponse.json({ error: '证据授权范围不匹配' }, { status: 409 });
    if (brief.execution?.mode !== 'generate_draft' || !['wechat', 'weibo', 'xiaohongshu', 'douyin'].includes(brief.execution.channel || '')) return NextResponse.json({ error: '该渠道需要人工内容任务，无自动生成额度消耗' }, { status: 422 });
    const evidenceToken = await issueContentProjectJWT({ userId: guard.ctx.session.user.id, workspaceId: guard.ctx.workspaceId, projectId: guard.ctx.projectId, role: guard.ctx.role });
    if (!await evidenceDraftReady(evidenceToken, brief.execution.channel!)) return NextResponse.json({ error: '当前渠道的新版内容服务尚未就绪，未预占生成额度' }, { status: 503 });
    const reservation = await reserveContentGeneration({ userId: guard.ctx.session.user.id, workspaceId: guard.ctx.workspaceId, operationId,
      requestHash: hashRequest(serviceBody), metadata: { source: 'evidence_v3', projectId: guard.ctx.projectId, approvalId: body.approvalId } });
    if (reservation.type === 'limit') return planLimitResponse(reservation.error);
    if (reservation.type === 'conflict' || (reservation.type === 'replay' && reservation.status === 'released')) return NextResponse.json({ error: '原生成操作已结束或存在冲突，请重新审批材料' }, { status: 409 });
    if (reservation.type === 'disabled') return NextResponse.json({ error: '额度账本未启用' }, { status: 503 });
    try {
      const response = await fetch(`${process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003'}/api/evidence-briefs/workflows`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${evidenceToken}` }, body: JSON.stringify(serviceBody), signal: AbortSignal.timeout(25000), cache: 'no-store',
      });
      const data = await response.json();
      if (response.ok && data?.data?.id) return NextResponse.json(data, { status: response.status });
      if (response.status >= 400 && response.status < 500) {
        const lookup = await lookupWorkflowByOperation(operationId);
        if (!lookup.found && !('unavailable' in lookup)) {
          await releaseUsageOperation(operationId, 'evidence_create_rejected');
          return NextResponse.json(data, { status: response.status });
        }
      }
      await markPendingReconcile(operationId);
    } catch { await markPendingReconcile(operationId); }
    return NextResponse.json({ error: '生成任务受理结果尚待确认，请使用同一审批编号重试', meta: { uncertain: true } }, { status: 503 });
  }
  if (body.action === 'approveDraft') {
    if (!['owner', 'admin', 'editor'].includes(guard.ctx.role)) return NextResponse.json({ error: '需要内容审批权限' }, { status: 403 });
    if (typeof body.actionId !== 'string' || !validId(body.actionId) || !Array.isArray(body.factIds) || body.factIds.length < 1 || body.factIds.length > 100 ||
        !body.factIds.every(id => typeof id === 'string' && validId(id)) || new Set(body.factIds).size !== body.factIds.length ||
        !['wechat', 'weibo', 'xiaohongshu', 'douyin', 'website', 'zhihu', 'toutiao'].includes(String(body.channel)) ||
        typeof body.title !== 'string' || body.title.trim().length < 5 || body.title.length > 200 || typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000 ||
        !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1 || body.factsScopeReviewed !== true ||
        !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 || typeof body.expiresAt !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(body.expiresAt) || !Number.isFinite(Date.parse(body.expiresAt)) ||
        typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
    const result = await fetchUpstream(guard.ctx, `/api/intelligence/actions/${body.actionId}/draft-approvals`, { method: 'POST',
      body: { factIds: body.factIds, channel: body.channel, title: body.title, reason: body.reason, expiresAt: body.expiresAt, expectedVersion: body.expectedVersion, expectedRevision: body.expectedRevision, factsScopeReviewed: body.factsScopeReviewed, idempotencyKey: body.idempotencyKey }, errorMessage: '草稿审批失败，请检查当前计划和事实' });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'previewDraft') {
    if (typeof body.approvalId !== 'string' || !validId(body.approvalId)) return badRequest();
    const token = await issueContentProjectJWT({ userId: guard.ctx.session.user.id, workspaceId: guard.ctx.workspaceId, projectId: guard.ctx.projectId, role: guard.ctx.role });
    try {
      const response = await fetch(`${process.env.CONTENT_SERVICE_URL || 'http://127.0.0.1:4003'}/api/evidence-briefs/preview`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Visibility-Authorization': `Bearer ${guard.ctx.serviceToken}` },
        body: JSON.stringify({ approvalId: body.approvalId }), signal: AbortSignal.timeout(15000), cache: 'no-store',
      });
      return NextResponse.json(await response.json(), { status: response.status });
    } catch { return NextResponse.json({ error: '证据 Brief 验证服务暂不可用' }, { status: 503 }); }
  }
  if (['reviewEvidence', 'approveFact', 'withdrawFact'].includes(String(body.action))) {
    if (typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey) ||
        !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 || typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000) return badRequest();
    const common = { idempotencyKey: body.idempotencyKey, expectedVersion: body.expectedVersion, reason: body.reason };
    let path: string;
    let payload: object;
    if (body.action === 'withdrawFact') {
      if (typeof body.factId !== 'string' || !validId(body.factId) || Number(body.expectedVersion) < 1) return badRequest();
      path = `/api/intelligence/facts/${body.factId}/withdraw`; payload = common;
    } else {
      if (typeof body.runId !== 'string' || !validId(body.runId)) return badRequest();
      if (body.action === 'reviewEvidence') {
        if (typeof body.evidenceId !== 'string' || !validId(body.evidenceId) || !['supports', 'partial', 'contradicts', 'unverified'].includes(String(body.relation)) || typeof body.sourceQuote !== 'string' || body.sourceQuote.length > 2000) return badRequest();
        path = `/api/intelligence/runs/${body.runId}/evidence/${body.evidenceId}/review`;
        payload = { ...common, relation: body.relation, sourceQuote: body.sourceQuote };
      } else {
        if (typeof body.reviewId !== 'string' || !validId(body.reviewId) || typeof body.entityId !== 'string' || !validId(body.entityId) ||
            typeof body.scope !== 'string' || body.scope.trim().length < 5 || body.scope.length > 1000 ||
            typeof body.validFrom !== 'string' || typeof body.validUntil !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(body.validFrom) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(body.validUntil) ||
            !Number.isFinite(Date.parse(body.validFrom)) || !Number.isFinite(Date.parse(body.validUntil)) || Date.parse(body.validUntil) <= Date.parse(body.validFrom)) return badRequest();
        path = `/api/intelligence/runs/${body.runId}/facts`;
        payload = { ...common, reviewId: body.reviewId, entityId: body.entityId, scope: body.scope, validFrom: body.validFrom, validUntil: body.validUntil };
      }
    }
    const result = await fetchUpstream(guard.ctx, path, { method: 'POST', body: payload, errorMessage: '证据或事实复核失败，请核对版本和原文' });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'createAction' || body.action === 'approveAction') {
    if (typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
    let path: string;
    let payload: object;
    if (body.action === 'createAction') {
      if (typeof body.runId !== 'string' || !validId(body.runId) || typeof body.diagnosisId !== 'string' || !validId(body.diagnosisId)) return badRequest();
      path = `/api/intelligence/runs/${body.runId}/actions`;
      payload = { diagnosisId: body.diagnosisId, idempotencyKey: body.idempotencyKey };
    } else {
      if (typeof body.actionId !== 'string' || !validId(body.actionId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1 ||
          typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000) return badRequest();
      path = `/api/intelligence/actions/${body.actionId}/approve`;
      payload = { expectedRevision: body.expectedRevision, reason: body.reason, idempotencyKey: body.idempotencyKey, scope: 'investigation_plan' };
    }
    const result = await fetchUpstream(guard.ctx, path, { method: 'POST', body: payload, errorMessage: '行动计划操作失败，请核对分析与证据版本' });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'reviewIdentity') {
    if (typeof body.runId !== 'string' || !validId(body.runId) || typeof body.entityId !== 'string' || !validId(body.entityId) ||
        !['confirmed', 'excluded'].includes(String(body.decision)) || typeof body.canonicalName !== 'string' || !body.canonicalName.trim() || body.canonicalName.length > 200 ||
        typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 2000 || !Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0 ||
        typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
    const result = await fetchUpstream(guard.ctx, `/api/intelligence/runs/${body.runId}/identity-decisions`, {
      method: 'POST', body: { entityId: body.entityId, decision: body.decision, canonicalName: body.canonicalName,
        reason: body.reason, expectedVersion: body.expectedVersion, idempotencyKey: body.idempotencyKey }, errorMessage: '实体确认失败，请刷新后核对版本',
    });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'retrySource') {
    if (typeof body.auditId !== 'string' || !/^[1-9][0-9]{0,17}$/.test(body.auditId) || !Number.isSafeInteger(Number(body.auditId)) ||
        typeof body.documentId !== 'string' || !validId(body.documentId) ||
        typeof body.idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey)) return badRequest();
    const result = await fetchUpstream(guard.ctx, `/api/intelligence/sources/${body.documentId}/retry`, {
      method: 'POST', body: { auditId: Number(body.auditId), idempotencyKey: body.idempotencyKey }, errorMessage: '来源补采请求失败',
    });
    if ('response' in result) return result.response;
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action === 'capture') {
    if (!Array.isArray(body.promptIds) || !body.promptIds.length || body.promptIds.length > 100 ||
        !body.promptIds.every(value => Number.isSafeInteger(value) && value > 0) ||
        (body.rounds !== undefined && body.rounds !== 1) ||
        typeof body.idempotencyKey !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,100}$/.test(body.idempotencyKey) ||
        new Set(body.promptIds).size !== body.promptIds.length ||
        body.promptIds.length * CAPTURE_PLATFORMS.length > 1000) return badRequest();
    const associations = await prisma.projectBrand.findMany({ where: { projectId: guard.ctx.projectId }, include: { brand: true }, orderBy: { brandId: 'asc' } });
    const brands = associations.filter(row => row.brand && !row.brand.deletedAt).map(row => ({
      id: row.brand.id, name: row.brand.name, aliases: row.brand.aliases || [], is_competitor: row.brand.isCompetitor || false,
    }));
    const sampling = { promptIds: body.promptIds, platforms: [...CAPTURE_PLATFORMS], rounds: 1,
      surface: 'managed_v1', idempotencyKey: body.idempotencyKey, conditions: { searchMode: 'unknown' } };
    const operationId = 'visibility-capture-' + createHash('sha256').update(`${guard.ctx.workspaceId}:${guard.ctx.projectId}:${body.idempotencyKey}`).digest('hex');
    const requestHash = createHash('sha256').update(JSON.stringify({ projectId: guard.ctx.projectId, sampling, brands })).digest('hex');
    const reservation = await reserveContentGeneration({ userId: guard.ctx.session.user.id, workspaceId: guard.ctx.workspaceId,
      operationId, requestHash, feature: 'visibility_audit', metadata: { projectId: guard.ctx.projectId, samplingVersion: 2 } });
    if (reservation.type === 'limit') return planLimitResponse(reservation.error);
    if (reservation.type === 'conflict') return NextResponse.json({ error: '采集请求编号已用于不同配置' }, { status: 409 });
    if (reservation.type === 'replay' && reservation.status === 'released') return NextResponse.json({ error: '原请求已结束，请用新的请求编号创建采集' }, { status: 409 });
    const result = await fetchUpstream(guard.ctx, `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/audits`, {
      method: 'POST', body: { sampling, brands }, timeoutMs: 30_000, errorMessage: '采集创建结果尚未确认，请使用相同请求编号重试',
    });
    if ('response' in result) {
      if (result.response.status >= 500) await markPendingReconcile(operationId);
      else await releaseUsageOperation(operationId, 'capture_validation_failed');
      return result.response;
    }
    if (!result.data || typeof (result.data as { audit_id?: unknown }).audit_id !== 'string') {
      await markPendingReconcile(operationId);
      return NextResponse.json({ error: '采集创建结果尚未确认' }, { status: 502 });
    }
    const committed = await commitUsageOperation(operationId);
    if (!committed.ok) {
      await markPendingReconcile(operationId);
      return NextResponse.json({ error: '采集已受理，额度状态尚待确认，请沿用原请求编号重试' }, { status: 502 });
    }
    return NextResponse.json(result.data, { status: 202 });
  }
  if (body.action !== undefined && body.action !== 'analyze') return badRequest();
  if (typeof body.auditId !== 'string' || !/^[1-9][0-9]{0,17}$/.test(body.auditId)) return badRequest();
  const result = await fetchUpstream(guard.ctx, `/api/intelligence/audits/${body.auditId}/runs`, {
    method: 'POST', errorMessage: '证据分析启动失败',
  });
  if ('response' in result) return result.response;
  return NextResponse.json(result.data, { status: 202 });
}
