import { NextRequest, NextResponse } from 'next/server';
import { resolveGuard } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { requestHash } from '@/lib/billing/idempotency';
import { reserveContentGeneration, commitUsageOperation, releaseUsageOperation, markPendingReconcile } from '@/lib/billing/usage-reservations';
import { planLimitResponse } from '@/lib/billing/usage';

class ExportError extends Error { constructor(message: string, public status: number) { super(message); } }
const MAX_PDF_BYTES = 20 * 1024 * 1024;
async function pdfBytes(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new ExportError('PDF 文件为空', 502);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_PDF_BYTES) { await reader.cancel(); throw new ExportError('报告超过导出大小限制', 422); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-' || !new TextDecoder().decode(bytes.subarray(Math.max(0, size - 1024))).includes('%%EOF')) throw new ExportError('报告服务未返回完整有效的 PDF', 502);
  return bytes;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await resolveGuard(req, { capability: 'auditReport' });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const key = req.headers.get('Idempotency-Key');
  let body: { runId?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: '无效的导出请求' }, { status: 400 }); }
  if (!/^[1-9][0-9]{0,17}$/.test(id) || !body || typeof body !== 'object' || Array.isArray(body) || typeof body.runId !== 'string' || !/^[a-f0-9]{32}$/.test(body.runId) || !key || !/^[a-zA-Z0-9_-]{8,100}$/.test(key)) return NextResponse.json({ error: '需要有效的审计、修订和操作编号' }, { status: 400 });
  const detail = guard.ctx.billing.capabilities.auditReport === 'basic' ? 'basic' : 'full';
  const input = { workspaceId: guard.ctx.workspaceId, projectId: guard.ctx.projectId, userId: guard.ctx.session.user.id, auditId: id, runId: body.runId, detail };
  const operationId = `pdf-${requestHash([input.workspaceId, input.userId, key])}`;
  let reserved = false, committed = false, committing = false;
  try {
    if (await prisma.projectContextOutbox.count({ where: { projectId: input.projectId, deliveredAt: null } })) throw new ExportError('品牌配置尚未同步，请刷新后再导出', 409);
    const quota = await reserveContentGeneration({ userId: input.userId, workspaceId: input.workspaceId, operationId, requestHash: requestHash(input), feature: 'pdf_export', metadata: { source: 'citation_report', ...input } });
    if (quota.type === 'limit') return planLimitResponse(quota.error);
    if (quota.type === 'conflict' || quota.type === 'replay' && !['reserved', 'pending_reconcile', 'committed'].includes(quota.status)) throw new ExportError('操作编号已使用，请重新发起导出', 409);
    reserved = quota.type === 'reserved' || quota.type === 'replay' && quota.status !== 'committed';
    committed = quota.type === 'replay' && quota.status === 'committed';
    const query = new URLSearchParams({ run_id: input.runId, detail });
    const response = await fetch(guard.ctx.upstreamUrl(`/api/intelligence/audits/${id}/report/pdf?${query}`), { headers: { ...guard.ctx.headers, Accept: 'application/pdf' }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new ExportError(response.status === 409 ? '分析快照已更新或尚未完成，请刷新报告' : 'PDF 生成失败，请稍后重试', response.status >= 500 ? 502 : response.status);
    if (response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/pdf' || response.headers.get('X-Report-Run-Id') !== input.runId) throw new ExportError('PDF 修订或文件类型不匹配', 502);
    const bytes = await pdfBytes(response);
    if (await prisma.projectContextOutbox.count({ where: { projectId: input.projectId, deliveredAt: null } })) throw new ExportError('品牌配置已变更，请刷新后再导出', 409);
    if (reserved) {
      committing = true;
      if (!(await commitUsageOperation(operationId)).ok) throw new ExportError('导出计费状态待确认，请使用同一操作编号重试', 503);
      committed = true; committing = false;
    }
    return new NextResponse(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="audit-${id}-${input.runId}.pdf"`, 'Cache-Control': 'no-store', 'X-Report-Run-Id': input.runId } });
  } catch (error) {
    if (committing) { await markPendingReconcile(operationId).catch(() => {}); }
    else if (reserved && !committed) {
      try { await releaseUsageOperation(operationId, 'pdf_export_failed'); }
      catch { return NextResponse.json({ error: '额度释放状态待确认，请使用同一操作编号重试' }, { status: 503 }); }
    }
    return NextResponse.json({ error: error instanceof ExportError ? error.message : '导出暂不可用，请使用同一操作编号重试' }, { status: error instanceof ExportError ? error.status : 503 });
  }
}

export async function GET() {
  return NextResponse.json({ error: '请通过报告页面主动发起 PDF 导出' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
}
