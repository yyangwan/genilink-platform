import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { requireBilling, BillingError } from '@/lib/billing/guard';
import { getExternalId } from '@/lib/proxy/zhijian-client';
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

  const auditId = req.nextUrl.searchParams.get('auditId');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const serviceToken = process.env.SERVICE_TOKEN;
    if (serviceToken) headers['Authorization'] = `Bearer ${serviceToken}`;

    const res = await fetch(
      `${VISIBILITY_URL}/api/analysis/projects/${externalId}/content-intelligence${auditId ? `?audit_id=${auditId}` : ''}`,
      { headers, signal: controller.signal }
    );

    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream error: ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    // Map upstream ContentIntelligenceOut → frontend ContentIntelligence
    const mapped = {
      sentiment: {
        positive: data.sentiment_breakdown?.positive || 0,
        neutral: data.sentiment_breakdown?.neutral || 0,
        negative: data.sentiment_breakdown?.negative || 0,
      },
      topics: Object.entries(data.topic_distribution || {}).map(([topic, count]) => ({
        topic,
        count: count as number,
        sentiment: 0.5, // upstream doesn't provide per-topic sentiment
      })),
      sources: (data.top_cited_sources || []).map((s: Record<string, unknown>) => ({
        source: s.domain as string,
        domain: s.domain as string,
        mention_count: s.total_count as number,
        authority_score: Math.round((s.authority_avg as number) * 20), // normalize 0-5 → 0-100
      })),
    };
    return NextResponse.json(mapped);
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return NextResponse.json({ error: 'Upstream timeout' }, { status: 504 });
    }
    return NextResponse.json({ error: 'Failed to fetch content intelligence' }, { status: 502 });
  }
}
