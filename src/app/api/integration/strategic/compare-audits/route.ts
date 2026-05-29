import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';

export async function POST(req: NextRequest) {
  // projectId comes from query params so the body stream stays intact for audit_ids
  const result = await resolveGuard(req);
  if (!result.ok) return result.response;

  // Parse body
  let body: { audit_ids: number[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (
    !Array.isArray(body.audit_ids) ||
    body.audit_ids.length < 2 ||
    body.audit_ids.length > 5 ||
    !body.audit_ids.every((id) => typeof id === 'number' && Number.isFinite(id))
  ) {
    return NextResponse.json({ error: 'audit_ids must be an array of 2-5 numeric IDs' }, { status: 400 });
  }

  const upstream = await fetchUpstream(
    result.ctx,
    `/api/strategic/projects/${result.ctx.externalId}/compare-audits`,
    { method: 'POST', body, errorMessage: 'Failed to compare audits' },
  );
  if ('response' in upstream) return upstream.response;
  return NextResponse.json(upstream.data);
}
