import { NextResponse } from 'next/server';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId, syncProjectToVisibility } from '@/lib/proxy/zhijian-client';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

export type ProjectResolution =
  | { ok: true; projectPk: number }
  | { ok: false; response: NextResponse };

/**
 * Resolve project context for brand proxy routes:
 * verify membership → billing → external mapping → sync → projectPk.
 */
export async function resolveBrandProject(
  projectId: string,
  userId: string,
  workspaceId: string,
): Promise<ProjectResolution> {
  const err = (status: number, error: string, extra?: Record<string, unknown>) =>
    ({ ok: false as const, response: NextResponse.json({ error, ...extra }, { status }) });

  const project = await verifyProjectInWorkspace(projectId, workspaceId);
  if (!project) return err(403, 'Project not found in workspace');

  try {
    await requireBilling(userId, workspaceId, 'visibility');
  } catch (e) {
    if (e instanceof BillingError) {
      return err(403, 'NO_SUBSCRIPTION', { module: 'visibility' });
    }
    throw e;
  }

  const externalId = await getExternalId(projectId, 'visibility');
  if (!externalId) return err(404, 'No external mapping for project');

  try {
    const projectPk = await syncProjectToVisibility(projectId, externalId);
    return { ok: true, projectPk };
  } catch (e) {
    return err(502, (e as Error).message);
  }
}

/** Known camelCase → snake_case field mappings for brand payloads. */
const BRAND_FIELD_MAP: Record<string, string> = {
  isCompetitor: 'is_competitor',
  productCategory: 'product_category',
  brandVoice: 'brand_voice',
};

/**
 * Transform camelCase brand fields to snake_case for the 智見 API.
 * Passes through unknown keys unchanged.
 */
export function transformBrandBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    out[BRAND_FIELD_MAP[key] ?? key] = value;
  }
  return out;
}

/** Common proxy fetch to 智見 visibility service. */
export async function proxyBrandFetch(
  method: string,
  path: string,
  opts?: { body?: unknown; timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    const res = await fetch(`${VISIBILITY_URL}${path}`, {
      method,
      headers,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
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

    if (res.status === 204) return new NextResponse(null, { status: 204 });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
