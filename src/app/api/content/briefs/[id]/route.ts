/**
 * GET/PATCH /api/content/briefs/[id]（设计 §10.3/§10.4）
 *
 * Portal BFF：鉴权后代理 ContentOS；PATCH 透传 Idempotency-Key 与 409 冲突信息。
 * workspace/project 归属由 ContentOS 按 service JWT 上下文强制，Portal 复核返回的 projectId。
 */

import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { getIdempotencyKey } from '@/lib/billing/idempotency';
import {
  ContentOSBriefError,
  getBrief,
  patchBrief,
} from '@/lib/content/contentos-brief-client';

function errorResponse(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

function mapContentOSError(err: ContentOSBriefError) {
  const details = err.details as { currentRevision?: number | null } | undefined;
  return errorResponse(
    err.status >= 500 ? 503 : err.status,
    err.code,
    err.message,
    details?.currentRevision !== undefined
      ? { currentRevision: details.currentRevision }
      : undefined,
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withContentAuth(async (ctx: ContentAuthContext) => {
    try {
      const result = await getBrief<{ projectId?: string }>(
        { projectId: ctx.projectId, serviceToken: ctx.serviceToken },
        id,
      );
      if (result.data.projectId && result.data.projectId !== ctx.projectId) {
        return errorResponse(403, 'BRIEF_PROJECT_MISMATCH', '创作方案不属于当前项目');
      }
      return NextResponse.json({ data: result.data });
    } catch (err) {
      if (err instanceof ContentOSBriefError) return mapContentOSError(err);
      console.error('[briefs/[id]] GET failed', err);
      return errorResponse(500, 'INTERNAL_ERROR', '读取创作方案失败');
    }
  }, { action: 'read' })(req);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withContentAuth(async (ctx: ContentAuthContext) => {
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      return errorResponse(400, 'IDEMPOTENCY_KEY_REQUIRED', '缺少 Idempotency-Key 请求头');
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, 'INVALID_JSON', '请求体不是合法 JSON');
    }

    try {
      const result = await patchBrief(
        { projectId: ctx.projectId, serviceToken: ctx.serviceToken },
        id,
        body,
        idempotencyKey,
      );
      return NextResponse.json({ data: result.data, meta: { replayed: false } });
    } catch (err) {
      if (err instanceof ContentOSBriefError) return mapContentOSError(err);
      console.error('[briefs/[id]] PATCH failed', err);
      return errorResponse(500, 'INTERNAL_ERROR', '更新创作方案失败');
    }
  }, { action: 'write' })(req);
}
