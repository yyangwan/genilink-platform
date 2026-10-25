import { NextRequest, NextResponse } from 'next/server';
import { fetchUpstream, resolveGuard } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { deliverProjectContext, freezeProjectContext } from '@/lib/visibility/project-context';

const id = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const key = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
const integer = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && Number(value) >= minimum;
const meaningful = (value: unknown, max = 2000): value is string => typeof value === 'string' && Array.from(value.trim()).length >= 5 && value.length <= max;
const bad = () => NextResponse.json({ error: '请核对材料、原文和当前版本' }, { status: 400 });

export async function GET(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  const params = req.nextUrl.searchParams, assetId = params.get('assetId'), op = params.get('op') || 'list';
  let path = `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/owned-assets`;
  if (op === 'list') {
    const offset = params.get('offset') || '0';
    if (!/^[0-9]{1,8}$/.test(offset)) return bad();
    path += `?offset=${offset}&limit=50`;
  } else if (op === 'text' || op === 'detail' || op === 'assetFacts') {
    if (!id(assetId)) return bad();
    path += `/${assetId}${op === 'text' ? '/text' : op === 'assetFacts' ? '/facts' : ''}`;
  } else if (op === 'facts') path = `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/facts`;
  else if (op === 'factSource') {
    const factId = params.get('factId');
    if (!id(factId)) return bad();
    path = `/api/intelligence/facts/${factId}/source`;
  } else return bad();
  const result = await fetchUpstream(guard.ctx, path, { errorMessage: '材料读取失败，请稍后重试' });
  return 'response' in result ? result.response : NextResponse.json(result.data);
}

export async function POST(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  if (!['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role)) return NextResponse.json({ error: '需要项目写入权限' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.projectId !== guard.ctx.projectId || !key(body.idempotencyKey)) return bad();
  const common = ['projectId', 'op', 'idempotencyKey'];
  let path = `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/owned-assets`;
  let fields: string[];
  if (body.op === 'register') {
    fields = ['registryBrandId', 'title', 'url', 'text', 'assetKey', 'expectedVersion'];
    if (typeof body.registryBrandId !== 'string' || !body.registryBrandId || body.registryBrandId.length > 50 ||
        typeof body.title !== 'string' || !body.title.trim() || body.title.length > 300 || !integer(body.expectedVersion) ||
        body.assetKey != null && !id(body.assetKey) || !!body.assetKey !== !!body.expectedVersion ||
        !body.url && !body.text || body.text != null && (typeof body.text !== 'string' || !body.text.trim() || Array.from(body.text).length > 200000)) return bad();
    if (body.url != null) {
      if (typeof body.url !== 'string' || body.url.length > 4096) return bad();
      try { const url = new URL(body.url); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return bad(); } catch { return bad(); }
    }
  } else {
    if (!id(body.assetId) && body.op !== 'withdrawFact') return bad();
    path += `/${body.assetId}`;
    common.push('assetId');
    if (body.op === 'verify') {
      fields = ['expectedVersion', 'materialHash', 'decision', 'scope', 'reason'];
      if (!integer(body.expectedVersion) || !/^[a-f0-9]{64}$/.test(body.materialHash) || !['verified', 'rejected'].includes(body.decision) || !meaningful(body.scope, 1000) || !meaningful(body.reason)) return bad();
      path += '/verify';
    } else if (body.op === 'retry') {
      fields = ['reason']; if (!meaningful(body.reason)) return bad(); path += '/retry';
    } else if (body.op === 'approveFact') {
      fields = ['expectedVersion', 'expectedVerificationVersion', 'materialHash', 'quote', 'start', 'end', 'scope', 'reason', 'validFrom', 'validUntil'];
      if (!integer(body.expectedVersion) || !integer(body.expectedVerificationVersion, 1) || !/^[a-f0-9]{64}$/.test(body.materialHash) ||
          typeof body.quote !== 'string' || !body.quote || Array.from(body.quote).length > 2000 || !integer(body.start) || !integer(body.end, 1) || body.end - body.start !== Array.from(body.quote).length ||
          !meaningful(body.scope, 1000) || !meaningful(body.reason) || !validDates(body.validFrom, body.validUntil)) return bad();
      path += '/facts';
    } else if (body.op === 'withdrawFact') {
      fields = ['expectedVersion', 'reason']; common.push('factId');
      if (!id(body.factId) || !integer(body.expectedVersion, 1) || !meaningful(body.reason)) return bad();
      path = `/api/intelligence/facts/${body.factId}/withdraw`;
    } else return bad();
  }
  if (Object.keys(body).some(field => ![...common, ...fields].includes(field))) return bad();
  const payload = Object.fromEntries(['idempotencyKey', ...fields].filter(field => body[field] !== undefined).map(field => [field, body[field]]));
  // The receiver must evaluate ownership against the current server-owned registry.
  try {
    await freezeProjectContext(guard.ctx);
    const delivery = await deliverProjectContext(guard.ctx);
    if (delivery) return delivery;
  } catch { return NextResponse.json({ error: '品牌配置同步暂未完成，请稍后重试' }, { status: 409 }); }
  if (await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } })) return NextResponse.json({ error: '品牌配置尚未同步，请稍后重试' }, { status: 409 });
  const result = await fetchUpstream(guard.ctx, path, { method: 'POST', body: payload, timeoutMs: 30000, errorMessage: '材料操作结果暂未确认，请使用原操作重试' });
  return 'response' in result ? result.response : NextResponse.json(result.data, { status: 202 });
}

function validDates(from: unknown, until: unknown) {
  return typeof from === 'string' && typeof until === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(from) && /(?:Z|[+-]\d{2}:\d{2})$/.test(until) &&
    Number.isFinite(Date.parse(from)) && Number.isFinite(Date.parse(until)) && Date.parse(until) > Date.parse(from);
}
