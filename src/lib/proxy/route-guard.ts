import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId, syncProjectToVisibility } from '@/lib/proxy/zhijian-client';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

export interface GuardContext {
  session: { user: { id: string } };
  workspaceId: string;
  projectId: string;
  externalId: string;
  /** Integer PK in the visibility service (resolved via sync). Only present when `sync: true`. */
  projectPk?: number;
  /** Build the full upstream URL for a given path. */
  upstreamUrl: (path: string) => string;
  /** Pre-configured headers with Content-Type and SERVICE_TOKEN. */
  headers: Record<string, string>;
}

export interface GuardOptions {
  /** Billing module to check. Default: 'visibility'. */
  module?: 'visibility' | 'content';
  /** Whether to resolve project PK via syncProjectToVisibility. Default: false. */
  sync?: boolean;
  /** Whether to require projectId (set false for routes like /platforms). Default: true. */
  requireProject?: boolean;
  /** Override default timeout in ms. Default: 15_000. */
  timeoutMs?: number;
}

type GuardResult =
  | { ok: true; ctx: GuardContext }
  | { ok: false; response: NextResponse };

/**
 * Resolve auth → workspace → billing → project verification → external ID.
 * Returns either a GuardContext for the route handler to use, or a NextResponse error.
 */
export async function resolveGuard(
  req: NextRequest,
  opts: GuardOptions = {},
): Promise<GuardResult> {
  const { module = 'visibility', sync = false, requireProject = true, timeoutMs = 15_000 } = opts;

  // 1. Auth
  const rawSession = await auth();
  if (!rawSession?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const session = { user: { id: rawSession.user.id } };

  // 2. Workspace
  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) {
    return { ok: false, response: NextResponse.json({ error: 'No workspace selected' }, { status: 400 }) };
  }

  // 3. Billing
  try {
    await requireBilling(session.user.id, workspaceId, module);
  } catch (err) {
    if (err instanceof BillingError) {
      return { ok: false, response: NextResponse.json({ error: 'NO_SUBSCRIPTION', module }, { status: 403 }) };
    }
    throw err;
  }

  // 4. Build upstream headers
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const serviceToken = process.env.SERVICE_TOKEN;
  if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

  // Helper for building URLs
  const upstreamUrl = (path: string) => `${VISIBILITY_URL}${path}`;

  // 5. If no project required, return early
  if (!requireProject) {
    return {
      ok: true,
      ctx: { session, workspaceId, projectId: '', externalId: '', upstreamUrl, headers },
    };
  }

  // 6. Project verification — try query params first (non-destructive) to avoid consuming the body stream
  let projectId: string | undefined = req.nextUrl.searchParams.get('projectId') || undefined;
  if (!projectId && req.method !== 'GET') {
    try {
      const body = await req.json();
      projectId = body.projectId;
    } catch {}
  }
  if (!projectId) {
    return { ok: false, response: NextResponse.json({ error: 'Missing projectId' }, { status: 400 }) };
  }

  const _project = await verifyProjectInWorkspace(projectId, workspaceId);
  if (!_project) {
    return { ok: false, response: NextResponse.json({ error: 'Project not found in workspace' }, { status: 403 }) };
  }

  // 7. External ID
  const externalId = await getExternalId(projectId, 'visibility');
  if (!externalId) {
    return { ok: false, response: NextResponse.json({ error: 'No external mapping for project' }, { status: 404 }) };
  }

  const ctx: GuardContext = { session, workspaceId, projectId, externalId, upstreamUrl, headers };

  // 8. Optional sync to get integer PK
  if (sync) {
    try {
      ctx.projectPk = await syncProjectToVisibility(projectId, externalId);
    } catch (err) {
      return { ok: false, response: NextResponse.json({ error: (err as Error).message }, { status: 502 }) };
    }
  }

  return { ok: true, ctx };
}

/**
 * Execute a proxied fetch with timeout, error handling, and status mapping.
 * Returns the upstream JSON data or a NextResponse error.
 */
export async function fetchUpstream(
  ctx: GuardContext,
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
    /** Custom error message for catch block. */
    errorMessage?: string;
  } = {},
): Promise<{ data: unknown } | { response: NextResponse }> {
  const { method = 'GET', body, timeoutMs = 15_000, errorMessage = 'Upstream request failed' } = opts;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(ctx.upstreamUrl(path), {
      method,
      headers: ctx.headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return {
        response: NextResponse.json(
          { error: `Upstream error: ${res.status}`, detail: errBody },
          { status: res.status >= 500 ? 502 : res.status },
        ),
      };
    }

    const data = await res.json();
    return { data };
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return { response: NextResponse.json({ error: 'Upstream timeout' }, { status: 504 }) };
    }
    return { response: NextResponse.json({ error: errorMessage }, { status: 502 }) };
  }
}
