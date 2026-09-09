/**
 * POST /api/internal/content-usage/operations/[operationId]/release（设计 §10.8）
 *
 * 取消或输入永久失败时释放预占额度；已提交的额度不能释放（409）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalServiceAuth } from '@/lib/auth/internal-service-auth';
import { releaseUsageOperation } from '@/lib/billing/usage-reservations';

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

  let reason: string | undefined;
  try {
    const body = (await req.json()) as { reason?: string };
    reason = typeof body.reason === 'string' ? body.reason.slice(0, 200) : undefined;
  } catch {
    // 请求体可选
  }

  const result = await releaseUsageOperation(operationId, reason);
  if (!result.ok) {
    if (result.reason === 'already-committed') {
      return NextResponse.json(
        { error: { code: 'USAGE_ALREADY_COMMITTED', message: '额度已提交，不能释放' } },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: { code: 'OPERATION_NOT_FOUND', message: '预占记录不存在' } },
      { status: 404 },
    );
  }
  return NextResponse.json({
    data: { operationId, status: result.status ?? 'released' },
  });
}
