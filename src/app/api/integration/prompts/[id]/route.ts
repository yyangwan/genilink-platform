import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId, evictCache } from '@/lib/proxy/zhijian-client';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

async function resolveVisibilityProjectId(
  projectId: string,
  externalId: string,
): Promise<number> {
  const parsed = parseInt(externalId, 10);
  if (!isNaN(parsed) && String(parsed) === externalId) return parsed;

  const serviceToken = process.env.SERVICE_TOKEN;
  if (!serviceToken) {
    throw new Error('SERVICE_TOKEN not configured — cannot auto-create visibility project');
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const name = project?.name || `Project-${projectId.slice(-6)}`;
  const industry = project?.industry || undefined;

  const res = await fetch(`${VISIBILITY_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceToken}`,
    },
    body: JSON.stringify({ name, industry }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`Failed to create project on visibility service: ${res.status}`);
  }

  const data = await res.json();
  const newId = String(data.id);

  await prisma.externalResourceMapping.update({
    where: { projectId_service: { projectId, service: 'visibility' } },
    data: { externalId: newId },
  });
  evictCache(projectId, 'visibility');

  return data.id as number;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
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
    projectPk = await resolveVisibilityProjectId(projectId, externalId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const { id } = await params;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    const res = await fetch(`${VISIBILITY_URL}/api/projects/${projectPk}/prompts/${id}`, {
      method: 'DELETE',
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

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: `Failed to delete prompt: ${(err as Error).message}` }, { status: 502 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;
  if (!workspaceId) {
    return NextResponse.json({ error: 'No workspace selected' }, { status: 400 });
  }

  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
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
    projectPk = await resolveVisibilityProjectId(projectId, externalId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }

  const { id } = await params;
  const body = await req.json();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    const res = await fetch(`${VISIBILITY_URL}/api/projects/${projectPk}/prompts/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
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
    return NextResponse.json(data);
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: `Failed to update prompt: ${(err as Error).message}` }, { status: 502 });
  }
}
