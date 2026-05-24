import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { validateWorkspaceAccess } from '@/lib/auth/workspace';

export interface BrandRouteContext {
  userId: string;
  workspaceId: string;
}

type BrandHandler = (
  req: NextRequest,
  ctx: BrandRouteContext,
  params?: Record<string, string>,
) => Promise<Response>;

/**
 * Wrapper for brand API routes: auth → workspace → membership validation.
 * No billing guard (brand management is free per D10).
 */
export function withBrandRoute(handler: BrandHandler) {
  return async (
    req: NextRequest,
    routeParams?: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = await getWorkspaceId(session.user.id);
    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
    }

    // Verify workspace membership (prevent cross-workspace access via cookie manipulation)
    const isMember = await validateWorkspaceAccess(session.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    let params: Record<string, string> | undefined;
    if (routeParams) {
      params = await routeParams.params;
    }

    return handler(req, { userId: session.user.id, workspaceId }, params);
  };
}
