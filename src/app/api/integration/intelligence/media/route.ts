import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { isAuditId, isRecordId } from '@/lib/visibility/v4-audit';

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;

  const params = req.nextUrl.searchParams;
  const auditId = params.get('auditId');
  const sampleId = params.get('sampleId');
  const snapshotId = params.get('snapshotId');
  const ordinal = params.get('ordinal') || '';
  const mediaOrdinal = params.get('mediaOrdinal') || '';
  if (!isAuditId(auditId) || !isRecordId(sampleId) || !isRecordId(snapshotId)
    || !/^[1-9][0-9]{0,2}$/.test(ordinal) || Number(ordinal) > 200
    || !/^[1-9][0-9]?$/.test(mediaOrdinal) || Number(mediaOrdinal) > 24) {
    return NextResponse.json({ error: '素材参数无效' }, { status: 400 });
  }

  try {
    const path = `/api/intelligence/audits/${auditId}/capture/samples/${sampleId}/sources/${ordinal}/media/${mediaOrdinal}`;
    const response = await fetch(guard.ctx.upstreamUrl(`${path}?${new URLSearchParams({ snapshot_id: snapshotId })}`), {
      headers: { ...guard.ctx.headers, Accept: 'image/webp' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (response.status === 404 || response.status === 409) {
      return NextResponse.json({ error: '素材快照暂不可查看' }, { status: response.status });
    }
    const length = Number(response.headers.get('content-length'));
    if (!response.ok || !response.body || response.headers.get('content-type') !== 'image/webp'
      || !Number.isSafeInteger(length) || length < 1 || length > MAX_PREVIEW_BYTES) {
      return NextResponse.json({ error: '素材快照暂不可查看' }, { status: 502 });
    }
    return new NextResponse(response.body, {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch {
    return NextResponse.json({ error: '素材快照暂不可查看' }, { status: 503 });
  }
}
