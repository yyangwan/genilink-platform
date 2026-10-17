import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard, fetchUpstream } from '@/lib/proxy/route-guard';
import { requireBilling } from '@/lib/billing/guard';
import { prisma } from '@/lib/db';
import type { ContentWorkbench } from '@/types/content-workbench';

export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get('cursor'), approvalId = req.nextUrl.searchParams.get('approvalId');
  if (cursor && approvalId || [cursor, approvalId].some(value => value !== null && !/^[a-f0-9]{32}$/.test(value))) return NextResponse.json({ error: '无效的材料查询' }, { status: 400 });
  const guard = await resolveGuard(req, { capability: 'contentInsights', minimumCapabilityLevel: 'full' });
  if (!guard.ok) return guard.response;
  try { await requireBilling(guard.ctx.session.user.id, guard.ctx.workspaceId, 'content'); }
  catch { return NextResponse.json({ error: '需要内容服务订阅' }, { status: 403 }); }
  const query = new URLSearchParams(); if (cursor) query.set('cursor', cursor); if (approvalId) query.set('approval_id', approvalId);
  const upstream = await fetchUpstream(guard.ctx, `/api/intelligence/projects/${encodeURIComponent(guard.ctx.projectId)}/content-workbench${query.size ? `?${query}` : ''}`, { errorMessage: '获批材料暂不可用' });
  if ('response' in upstream) return upstream.response;
  const data = upstream.data as ContentWorkbench;
  if (data?.schema !== 'citation-content-workbench-1' || data.project_id !== guard.ctx.projectId || data.cursor !== cursor || data.approval_id !== approvalId || data.publication_allowed !== false || approvalId && data.enabled && (data.items.length !== 1 || data.items[0].id !== approvalId)) return NextResponse.json({ error: '材料上下文不匹配' }, { status: 502 });
  const pending = await prisma.projectContextOutbox.count({ where: { projectId: guard.ctx.projectId, deliveredAt: null } }) > 0;
  return NextResponse.json({ ...data, context_sync_pending: pending,
    can_manage_tasks: data.enabled && ['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role),
    can_prepare: data.enabled && !pending && ['owner', 'admin', 'editor', 'member'].includes(guard.ctx.role),
    items: data.items.map(item => pending && item.status === 'ready' ? { ...item, status: 'stale', execution: null } : item) }, { headers: { 'Cache-Control': 'no-store' } });
}
