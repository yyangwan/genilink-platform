import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { cookies } from 'next/headers';

export interface ContentAuthContext {
  userId: string;
  workspaceId: string;
  projectId: string;
}

type ContentHandler = (
  ctx: ContentAuthContext,
  req: NextRequest,
) => Promise<Response>;

/**
 * Shared auth wrapper for content API routes.
 * Validates session, workspace, project ownership, and billing in one pass.
 */
export function withContentAuth(handler: ContentHandler) {
  return async (req: NextRequest): Promise<Response> => {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cookieStore = await cookies();
    const workspaceId = cookieStore.get('genilink-workspace')?.value;
    if (!workspaceId) {
      return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
    }

    // Extract projectId from query params (GET) or body (POST/PUT/DELETE)
    let projectId: string | null = req.nextUrl.searchParams.get('projectId');

    if (!projectId && req.method !== 'GET') {
      try {
        const body = await req.json();
        projectId = body.projectId ?? null;
      } catch {
        // Body parsing failed — will be caught by projectId check below
      }
    }

    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const _project = await verifyProjectInWorkspace(projectId, workspaceId);
    if (!_project) {
      return NextResponse.json({ error: 'Project not found in workspace' }, { status: 403 });
    }

    try {
      await requireBilling(session.user.id, workspaceId, 'content');
    } catch (err) {
      if (err instanceof BillingError) {
        return NextResponse.json({ error: 'NO_SUBSCRIPTION', module: 'content' }, { status: 403 });
      }
      throw err;
    }

    return handler({ userId: session.user.id, workspaceId, projectId }, req);
  };
}
