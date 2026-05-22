import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { requirePermission, PermissionDeniedError, ContentAction } from '@/lib/auth/content-permissions';
import { getExternalId } from '@/lib/proxy/zhijian-client';
import { cookies } from 'next/headers';

export interface ContentAuthContext {
  userId: string;
  workspaceId: string;
  projectId: string;
  role: string;
  externalId: string;
}

type ContentHandler = (
  ctx: ContentAuthContext,
  req: NextRequest,
) => Promise<Response>;

type ContentAuthOptions = {
  action: ContentAction;
};

/**
 * Shared auth wrapper for content API routes.
 * Validates session, workspace, project ownership, billing, and role permissions.
 */
export function withContentAuth(
  handler: ContentHandler,
  options: ContentAuthOptions,
) {
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
        // Clone the request so the body remains readable by downstream handlers.
        // Web API body is single-read — req.json() here would consume it.
        const cloned = req.clone();
        const body = await cloned.json();
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

    const externalId = await getExternalId(projectId, 'content');
    if (!externalId) {
      return NextResponse.json({ error: 'No external mapping for project' }, { status: 404 });
    }

    try {
      await requireBilling(session.user.id, workspaceId, 'content');
    } catch (err) {
      if (err instanceof BillingError) {
        return NextResponse.json({ error: 'NO_SUBSCRIPTION', module: 'content' }, { status: 403 });
      }
      throw err;
    }

    let role: string;
    try {
      role = await requirePermission(session.user.id, workspaceId, options.action);
    } catch (err) {
      if (err instanceof PermissionDeniedError) {
        return NextResponse.json(
          { error: 'Insufficient permissions', action: options.action, role: err.role },
          { status: 403 },
        );
      }
      throw err;
    }

    return handler({ userId: session.user.id, workspaceId, projectId, role, externalId }, req);
  };
}
