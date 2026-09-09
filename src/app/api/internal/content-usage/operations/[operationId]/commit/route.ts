/**
 * POST /api/internal/content-usage/operations/[operationId]/commit（设计 §10.8）
 *
 * ContentOS worker 在第一次调用内容模型前回调提交额度。
 * 共享密钥鉴权（CONTENT_USAGE_CALLBACK_SECRET）；幂等（重复提交返回成功）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceAuth } from '@/lib/auth/internal-service-auth';
import { commitUsageOperation } from '@/lib/billing/usage-reservations';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ operationId: string }> },
) {
  const auth = verifyInternalServiceAuth(req, 'CONTENT_USAGE_CALLBACK_SECRET');
  if (!auth.ok) return auth.response;

  const { operationId } = await params;
  if (!operationId) {
    return NextResponse.json(
      { error: { code: 'MISSING_OPERATION_ID', message: '缺少 operationId' } },
      { status: 400 },
    );
  }

  const result = await commitUsageOperation(operationId);
  if (!result.ok && result.reason === 'not-found') {
    return NextResponse.json(
      { error: { code: 'OPERATION_NOT_FOUND', message: '预占记录不存在' } },
      { status: 404 },
    );
  }
  // already-committed 或成功都返回 200（幂等）。
  return NextResponse.json({
    data: { operationId, status: result.status ?? 'committed' },
  });
}
