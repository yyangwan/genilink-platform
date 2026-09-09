/**
 * POST /api/content/workflows（设计 §10.5）
 *
 * 顺序：鉴权 → 契约校验 → 平台能力 → 额度预占（operationId 关联）→
 * 调用 ContentOS → 202。明确 4xx → 释放预占；超时/中断 → pending_reconcile。
 */

import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { getIdempotencyKey, requestHash, sha256 } from '@/lib/billing/idempotency';
import { planLimitResponse } from '@/lib/billing/usage';
import {
  markPendingReconcile,
  releaseUsageOperation,
  reserveContentGeneration,
} from '@/lib/billing/usage-reservations';
import { getGenerationCapabilities, isPlatformSupported } from '@/lib/content/capabilities';
import {
  ContentOSWorkflowError,
  createContentWorkflow,
} from '@/lib/content/content-workflow-client';
import type { SupportedGenerationPlatform } from '@/contracts/content-creation-brief-v1';

interface BrowserWorkflowBody {
  briefId?: unknown;
  briefRevision?: unknown;
  platforms?: unknown;
  templateId?: unknown;
  brandVoiceId?: unknown;
}

function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export const POST = withContentAuth(async (ctx: ContentAuthContext, req: NextRequest) => {
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return errorResponse(400, 'IDEMPOTENCY_KEY_REQUIRED', '缺少 Idempotency-Key 请求头');
  }

  let body: BrowserWorkflowBody;
  try {
    body = (await req.json()) as BrowserWorkflowBody;
  } catch {
    return errorResponse(400, 'INVALID_JSON', '请求体不是合法 JSON');
  }

  if (typeof body.briefId !== 'string' || !body.briefId) {
    return errorResponse(400, 'MISSING_BRIEF_ID', '缺少 briefId');
  }
  if (typeof body.briefRevision !== 'number' || !Number.isInteger(body.briefRevision) || body.briefRevision < 1) {
    return errorResponse(400, 'INVALID_BRIEF_REVISION', 'briefRevision 必须是正整数');
  }
  if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
    return errorResponse(400, 'PLATFORM_MISSING', '请至少选择一个平台');
  }
  const platforms = body.platforms as string[];
  if (platforms.some((p) => typeof p !== 'string')) {
    return errorResponse(400, 'INVALID_PLATFORMS', 'platforms 必须是字符串数组');
  }
  if (new Set(platforms).size !== platforms.length) {
    return errorResponse(400, 'DUPLICATE_PLATFORMS', 'platforms 不能有重复');
  }
  if (typeof body.templateId !== 'string' && body.templateId !== undefined) {
    return errorResponse(400, 'INVALID_TEMPLATE_ID', 'templateId 必须是字符串');
  }
  if (typeof body.brandVoiceId !== 'string' && body.brandVoiceId !== undefined) {
    return errorResponse(400, 'INVALID_BRAND_VOICE_ID', 'brandVoiceId 必须是字符串');
  }

  // 平台能力校验（§10.5 步骤 2）：不支持的平台在预占额度之前拒绝。
  const capabilities = await getGenerationCapabilities();
  const unsupported = platforms.filter((p) => !isPlatformSupported(capabilities, p));
  if (unsupported.length > 0) {
    return errorResponse(
      422,
      'PLATFORM_NOT_SUPPORTED',
      `当前暂不支持自动生成：${unsupported.join('、')}，请选择其他平台`,
      { platforms: unsupported },
    );
  }

  // 操作 ID：content-workflow:<workspaceId>:<sha256(idempotencyKey)>
  // 日志与对账只使用 operationId，不记录原始幂等键（设计 §10.5/§14）。
  const operationId = `content-workflow:${ctx.workspaceId}:${sha256(idempotencyKey)}`;
  const serviceBody = {
    briefId: body.briefId,
    briefRevision: body.briefRevision,
    platforms: platforms as SupportedGenerationPlatform[],
    ...(typeof body.templateId === 'string' && body.templateId ? { templateId: body.templateId } : {}),
    ...(typeof body.brandVoiceId === 'string' && body.brandVoiceId
      ? { brandVoiceId: body.brandVoiceId }
      : {}),
    usageOperationId: operationId,
  };
  const hash = requestHash(serviceBody);

  // 步骤 3：预占额度（同一操作只占一次）。
  const reservation = await reserveContentGeneration({
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    operationId,
    requestHash: hash,
    metadata: { projectId: ctx.projectId, briefId: body.briefId, source: 'workflow' },
  });
  if (reservation.type === 'limit') {
    return planLimitResponse(reservation.error);
  }
  if (reservation.type === 'conflict') {
    return errorResponse(409, 'IDEMPOTENCY_KEY_REUSED', '相同幂等键已用于不同请求体');
  }

  // 步骤 4：调用 ContentOS 创建工作流。
  try {
    const result = await createContentWorkflow(
      { projectId: ctx.projectId, serviceToken: ctx.serviceToken },
      serviceBody,
      idempotencyKey,
    );
    return NextResponse.json(
      { data: result.data, meta: { replayed: result.replayed || reservation.type === 'replay' } },
      { status: result.replayed ? 200 : 202 },
    );
  } catch (err) {
    if (err instanceof ContentOSWorkflowError && err.status === 0) {
      // 结果不确定（超时/断连）：不得释放预占，进入对账（设计 §7.3）。
      await markPendingReconcile(operationId);
      console.error('[content/workflows] ambiguous create', { operationId });
      return NextResponse.json(
        {
          data: null,
          meta: { uncertain: true },
          error: {
            code: 'WORKFLOW_CREATE_PENDING',
            message: '请求正在确认中，请勿重复提交；稍后会自动恢复结果',
          },
        },
        { status: 202 },
      );
    }
    if (err instanceof ContentOSWorkflowError && err.status >= 400 && err.status < 500) {
      // 明确拒绝：释放预占，不扣额度。
      await releaseUsageOperation(operationId, `rejected:${err.code}`);
      return errorResponse(err.status, err.code, err.message);
    }
    console.error('[content/workflows] create failed', { operationId, err });
    // 5xx 且非明确拒绝：保守保留预占并标记对账。
    await markPendingReconcile(operationId);
    return errorResponse(503, 'CONTENT_SERVICE_UNAVAILABLE', '智创服务暂不可用，请稍后重试；不会重复扣除额度');
  }
}, { action: 'write' });
