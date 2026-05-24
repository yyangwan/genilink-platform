import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId, evictCache, syncProjectToVisibility } from '@/lib/proxy/zhijian-client';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  // Verify project belongs to this workspace
  const _project = await verifyProjectInWorkspace(projectId, workspaceId);
  if (!_project) {
    return NextResponse.json({ error: 'Project not found in workspace' }, { status: 403 });
  }

  try {
    await requireBilling(session.user.id, workspaceId, 'visibility');
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: 'NO_SUBSCRIPTION', module: 'visibility' }, { status: 403 });
    }
    throw err;
  }

  const externalId = await getExternalId(projectId, 'visibility');
  if (!externalId) {
    return NextResponse.json({ error: 'No external mapping for project' }, { status: 404 });
  }

  let projectPk: number;
  try {
    projectPk = await syncProjectToVisibility(projectId, externalId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    const res = await fetch(`${VISIBILITY_URL}/api/suggestions/${projectPk}`, {
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Upstream error: ${res.status}`, detail: errBody },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const data = await res.json();

    // Map upstream SuggestionOut → frontend Suggestion shape
    const mapped = (Array.isArray(data) ? data : []).map(mapSuggestion);
    return NextResponse.json(mapped);
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: `Failed to fetch suggestions: ${(err as Error).message}` }, { status: 502 });
  }
}

// POST /api/integration/suggestions — generate suggestions for project
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const body = await req.json();
  const projectId = body.projectId || req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const _project = await verifyProjectInWorkspace(projectId, workspaceId);
  if (!_project) {
    return NextResponse.json({ error: 'Project not found in workspace' }, { status: 403 });
  }

  try {
    await requireBilling(session.user.id, workspaceId, 'visibility');
  } catch (err) {
    if (err instanceof BillingError) {
      return NextResponse.json({ error: 'NO_SUBSCRIPTION', module: 'visibility' }, { status: 403 });
    }
    throw err;
  }

  const externalId = await getExternalId(projectId, 'visibility');
  if (!externalId) {
    return NextResponse.json({ error: 'No external mapping for project' }, { status: 404 });
  }

  let projectPk: number;
  try {
    projectPk = await syncProjectToVisibility(projectId, externalId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    const res = await fetch(`${VISIBILITY_URL}/api/suggestions/${projectPk}/generate`, {
      method: 'POST',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Upstream error: ${res.status}`, detail: errBody },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const data = await res.json();
    const mapped = (Array.isArray(data) ? data : []).map(mapSuggestion);
    return NextResponse.json(mapped);
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: `Failed to generate suggestions: ${(err as Error).message}` }, { status: 502 });
  }
}

/** Map upstream SuggestionOut → frontend Suggestion */
function mapSuggestion(s: Record<string, unknown>) {
  return {
    id: String(s.id),
    text: (s.title as string) || (s.description as string) || '',
    category: (s.category as string) || '',
    platform: ((s.detail as Record<string, unknown>)?.platform as string) || '',
    priority: (s.priority as string) || 'medium',
    status: s.is_resolved ? 'resolved' : 'pending',
  };
}
