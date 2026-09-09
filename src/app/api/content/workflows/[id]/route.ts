/**
 * GET /api/content/workflows/[id]（设计 §10.6）：平台级状态与错误透传。
 */

import { NextRequest, NextResponse } from 'next/server';
import { withContentAuth, ContentAuthContext } from '@/lib/auth/content-auth';
import {
  ContentOSWorkflowError,
  getWorkflow,
} from '@/lib/content/content-workflow-client';

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withContentAuth(async (ctx: ContentAuthContext) => {
    try {
      const result = await getWorkflow(
        { projectId: ctx.projectId, serviceToken: ctx.serviceToken },
        id,
      );
      return NextResponse.json({ data: result.data });
    } catch (err) {
      if (err instanceof ContentOSWorkflowError) {
        if (err.status === 0) {
          return errorResponse(503, 'CONTENT_SERVICE_UNAVAILABLE', '智创服务暂不可用');
        }
        return errorResponse(err.status, err.code, err.message);
      }
      console.error('[content/workflows/[id]] GET failed', err);
      return errorResponse(500, 'INTERNAL_ERROR', '查询工作流失败');
    }
  }, { action: 'read' })(req);
}
