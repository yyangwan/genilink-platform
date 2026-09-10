/**
 * POST /api/content/workflows/[id]/platforms/[platform]/retry（设计 §10.7）
 *
 * 重试不新增额度；同一工作流保留原 ID。透传 ContentOS 的 409 语义。
 */

import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import { getIdempotencyKey } from '@/lib/billing/idempotency';
import {
  ContentOSWorkflowError,
  retryPlatform,
} from '@/lib/content/content-workflow-client';

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; platform: string }> },
) {
  const { id, platform } = await params;
  return withContentAuth(async (ctx: ContentAuthContext) => {
    // 防连点：复用浏览器提供的幂等键；未提供时生成。
    const idempotencyKey = getIdempotencyKey(req) ?? crypto.randomUUID();
    try {
      const result = await retryPlatform(
        { projectId: ctx.projectId, serviceToken: ctx.serviceToken },
        id,
        platform,
        idempotencyKey,
      );
      return NextResponse.json({ data: result.data }, { status: 202 });
    } catch (err) {
      if (err instanceof ContentOSWorkflowError) {
        if (err.status === 0) {
          return errorResponse(503, 'CONTENT_SERVICE_UNAVAILABLE', '智创服务暂不可用，请稍后重试');
        }
        return errorResponse(err.status, err.code, err.message);
      }
      console.error('[content/workflows/[id]/platforms/[platform]/retry] failed', err);
      return errorResponse(500, 'INTERNAL_ERROR', '重试失败，请稍后重试');
    }
  }, { action: 'write' })(req);
}
