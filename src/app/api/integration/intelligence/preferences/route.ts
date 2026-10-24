import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { parsePreferences, preferenceView, setBusinessPreferences } from '@/lib/visibility/business-preferences';
import { ContextConflict, deliverProjectContext } from '@/lib/visibility/project-context';

export async function GET(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  const context = await prisma.projectIntelligenceContext.findUnique({ where: { projectId: guard.ctx.projectId } });
  return NextResponse.json({ ...preferenceView(context), syncPending: !!await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } }) });
}
export async function PUT(req: NextRequest) {
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  if (!['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role)) return NextResponse.json({ error: '需要项目写入权限' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['projectId', 'expectedVersion', 'preferences'].includes(key)) || body.projectId !== guard.ctx.projectId || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) return NextResponse.json({ error: '配置请求格式不正确' }, { status: 400 });
  const preferences = parsePreferences(body.preferences);
  if (!preferences) return NextResponse.json({ error: '请核对场景、重要性及至少 5 个字的设置理由' }, { status: 400 });
  try {
    const context = await setBusinessPreferences(guard.ctx, body.expectedVersion, preferences);
    // Local save is durable even when the receiver is temporarily unavailable.
    try { await deliverProjectContext(guard.ctx); } catch { /* durable outbox retry owns delivery */ }
    const syncPending = !!await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } });
    return NextResponse.json({ ...preferenceView(context), syncPending, saved: true });
  } catch (error) {
    if (error instanceof ContextConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
