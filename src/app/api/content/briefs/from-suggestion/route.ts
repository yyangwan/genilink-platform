/**
 * POST /api/content/briefs/from-suggestion（设计 §10.2）
 *
 * 浏览器只提交 suggestionId；Portal 从智见服务端重新读取规范建议，
 * 组装白名单快照后调用 ContentOS 创建规则版 Brief。不消耗生成额度。
 */

import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth } from '@/lib/auth/content-auth';
import { prisma } from '@/lib/db';
import { getIdempotencyKey } from '@/lib/billing/idempotency';
import { loadCanonicalSuggestion } from '@/lib/content/canonical-suggestion';
import {
  assertSnapshotLimits,
  buildProjectSnapshot,
  buildSourceSnapshot,
  computeSourceHash,
} from '@/lib/content/source-snapshot';
import {
  ContentOSBriefError,
  createBriefFromSnapshot,
} from '@/lib/content/contentos-brief-client';

function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export const POST = withContentAuth(async (ctx, req: NextRequest) => {
  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    return errorResponse(400, 'IDEMPOTENCY_KEY_REQUIRED', '缺少 Idempotency-Key 请求头');
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'INVALID_JSON', '请求体不是合法 JSON');
  }

  // 只接受 suggestionId；不允许浏览器提交建议正文（设计 §7.1 规则 1）。
  const allowedKeys = new Set(['projectId', 'suggestionId']);
  const extraKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length > 0) {
    return errorResponse(
      400,
      'SUGGESTION_PAYLOAD_FORBIDDEN',
      '请求只接受 suggestionId，不能提交建议正文',
      { fields: extraKeys },
    );
  }
  const suggestionId = typeof body.suggestionId === 'string' ? body.suggestionId.trim() : '';
  if (!suggestionId) {
    return errorResponse(400, 'MISSING_SUGGESTION_ID', '缺少 suggestionId');
  }

  // 服务端重新读取规范建议（不信任浏览器回传）。
  const loaded = await loadCanonicalSuggestion({
    identity: { userId: ctx.userId, role: ctx.role },
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    suggestionId,
  });
  if (!loaded.ok) {
    if (loaded.code === 'SUGGESTION_NOT_FOUND') {
      return errorResponse(404, 'SUGGESTION_NOT_FOUND', '当前项目内不存在该建议');
    }
    return errorResponse(502, 'VISIBILITY_UNAVAILABLE', '智见服务暂不可用，请稍后重试');
  }

  const project = await prisma.project.findFirst({
    where: { id: ctx.projectId, workspaceId: ctx.workspaceId },
    select: {
      id: true,
      name: true,
      url: true,
      industry: true,
      productName: true,
      productKeywords: true,
      productDescription: true,
    },
  });
  if (!project) {
    return errorResponse(404, 'PROJECT_NOT_FOUND', '项目不存在');
  }

  const sourceSnapshot = buildSourceSnapshot(loaded.suggestion);
  const projectSnapshot = buildProjectSnapshot(project);
  const violations = assertSnapshotLimits(sourceSnapshot);
  if (violations.length > 0) {
    // 超限不得静默截断（设计 §8.3）。
    return errorResponse(
      422,
      'SOURCE_PAYLOAD_TOO_LARGE',
      '建议内容超出可处理范围，请先在智见中调整后再试',
      { fields: violations },
    );
  }
  const sourceHash = computeSourceHash(sourceSnapshot);

  const suggestionRef: { reportId?: string; auditId?: string } = {};
  if (loaded.suggestion.report_id !== undefined) suggestionRef.reportId = String(loaded.suggestion.report_id);
  if (loaded.suggestion.audit_id !== undefined) suggestionRef.auditId = String(loaded.suggestion.audit_id);

  try {
    const result = await createBriefFromSnapshot(
      { projectId: ctx.projectId, serviceToken: ctx.serviceToken },
      {
        sourceSnapshot,
        projectSnapshot,
        ...(Object.keys(suggestionRef).length > 0 ? { suggestionRef } : {}),
      },
      idempotencyKey,
    );

    return NextResponse.json(
      { data: result.data, meta: { replayed: result.replayed, sourceHash } },
      { status: result.replayed ? 200 : 201 },
    );
  } catch (err) {
    if (err instanceof ContentOSBriefError) {
      const status = err.status >= 500 ? 503 : err.status;
      return errorResponse(
        status,
        err.code,
        err.status === 422 && err.code === 'SUGGESTION_NOT_CONTENT_ELIGIBLE'
          ? '该建议属于技术/运营任务，不适合转换为内容创作方案'
          : err.message,
      );
    }
    console.error('[briefs/from-suggestion] unexpected error', err);
    return errorResponse(500, 'INTERNAL_ERROR', '创建创作方案失败，请稍后重试');
  }
}, { action: 'write' });
