import { NextResponse } from 'next/server';
import { verifyInternalServiceAuth } from '@/lib/auth/internal-service-auth';
import { prisma } from '@/lib/db';
import { getWorkspaceRole, verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { issueVisibilityProjectJWT } from '@/lib/auth/service-jwt';
import { requireBilling, requireBillingCapability } from '@/lib/billing/guard';

// Reissue a short-lived audience-specific token from a bound operation, never from caller identity.
export async function POST(req: Request) {
  const auth = verifyInternalServiceAuth(req, 'CONTENT_USAGE_CALLBACK_SECRET');
  if (!auth.ok) return auth.response;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'invalid_request' }, { status: 400 }); }
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !['operationId', 'workspaceId', 'projectId', 'approvalId'].includes(key)) ||
      !['operationId', 'workspaceId', 'projectId', 'approvalId'].every(key => typeof body[key] === 'string' && (body[key] as string).length <= 191) ||
      !/^[a-f0-9]{32}$/.test(String(body.approvalId))) return NextResponse.json({ error: 'invalid_request' }, { status: 422 });
  const operation = await prisma.usageEvent.findFirst({ where: { operationId: String(body.operationId), workspaceId: String(body.workspaceId), feature: 'content_generation' } });
  const metadata = operation?.metadata as { source?: string; projectId?: string; approvalId?: string } | null;
  if (!operation?.userId || !['reserved', 'pending_reconcile', 'committed'].includes(operation.status) ||
      metadata?.source !== 'evidence_v2' || metadata.projectId !== body.projectId || metadata.approvalId !== body.approvalId) {
    return NextResponse.json({ error: 'evidence_operation_mismatch' }, { status: 403 });
  }
  const projectId = String(body.projectId), workspaceId = operation.workspaceId;
  const role = await getWorkspaceRole(operation.userId, workspaceId);
  if (!role || !['owner', 'admin', 'editor', 'member'].includes(role) || !await verifyProjectInWorkspace(projectId, workspaceId)) return NextResponse.json({ error: 'project_access_revoked' }, { status: 403 });
  try {
    const access = await requireBilling(operation.userId, workspaceId, 'visibility');
    requireBillingCapability(access, 'contentInsights', 'full');
    await requireBilling(operation.userId, workspaceId, 'content');
  } catch { return NextResponse.json({ error: 'subscription_required' }, { status: 403 }); }
  try {
    if (await prisma.projectContextOutbox.count({ where: { projectId, deliveredAt: null } })) return NextResponse.json({ error: 'project_context_sync_pending' }, { status: 409 });
    const token = await issueVisibilityProjectJWT({ userId: operation.userId, workspaceId, projectId, role });
    const response = await fetch(`${process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000'}/api/intelligence/draft-approvals/${body.approvalId}/brief`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (!response.ok) return NextResponse.json({ error: 'evidence_authorization_unavailable_or_stale' }, { status: response.status >= 500 ? 503 : response.status });
    return NextResponse.json({ data: { brief: await response.json() } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'evidence_verification_unavailable' }, { status: 503 }); }
}
