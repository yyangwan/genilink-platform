// Shared helpers for billing API routes: auth context + unified error envelope.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { BillingError, errorResponseBody, toBillingError } from '@/lib/billing/types';

export async function getAuthContext(): Promise<{ userId: string; workspaceId: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    throw toBillingError('UNAUTHORIZED');
  }
  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    throw new BillingError('NOT_FOUND', '当前用户没有可用的工作空间', 404);
  }
  return { userId: session.user.id, workspaceId };
}

export function billingErrorResponse(error: unknown): NextResponse {
  if (error instanceof BillingError) {
    return NextResponse.json(errorResponseBody(error.code, error.message, error.details), {
      status: error.status,
    });
  }
  console.error('billing_api_error', error);
  return NextResponse.json(errorResponseBody('INTERNAL_ERROR'), { status: 500 });
}
