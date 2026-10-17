import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
vi.mock('@/lib/proxy/route-guard', () => ({ resolveGuard: vi.fn() }));
vi.mock('@/lib/db', () => ({ prisma: { projectContextOutbox: { count: vi.fn() } } }));
vi.mock('@/lib/billing/usage-reservations', () => ({ reserveContentGeneration: vi.fn(), commitUsageOperation: vi.fn(), releaseUsageOperation: vi.fn(), markPendingReconcile: vi.fn() }));
import { resolveGuard } from '@/lib/proxy/route-guard';
import { prisma } from '@/lib/db';
import { reserveContentGeneration, commitUsageOperation, releaseUsageOperation, markPendingReconcile } from '@/lib/billing/usage-reservations';
import { POST } from '@/app/api/integration/reports/[id]/pdf/route';
const runId = 'a'.repeat(32);
const req = (data: unknown = { runId }) => new NextRequest('http://localhost/api/integration/reports/12/pdf?projectId=p1', { method: 'POST', headers: { 'Idempotency-Key': 'export-key-123' }, body: JSON.stringify(data) });
const params = { params: Promise.resolve({ id: '12' }) };
function guard(level = 'full') { return { ok: true, ctx: { projectId: 'p1', workspaceId: 'ws', session: { user: { id: 'u1' } }, headers: { Authorization: 'fake-jwt' }, upstreamUrl: (path: string) => `http://trusted${path}`, billing: { capabilities: { auditReport: level } } } } as unknown as Awaited<ReturnType<typeof resolveGuard>>; }
const pdf = (content = '%PDF-1.4 test\n%%EOF', id = runId) => new Response(content, { headers: { 'Content-Type': 'application/pdf', 'X-Report-Run-Id': id } });
describe('version-bound PDF quota accounting', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(resolveGuard).mockResolvedValue(guard()); vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(0); vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'reserved', usageEventId: 'usage' }); vi.mocked(commitUsageOperation).mockResolvedValue({ ok: true, status: 'committed' }); vi.mocked(releaseUsageOperation).mockResolvedValue({ ok: true, status: 'released' }); vi.mocked(markPendingReconcile).mockResolvedValue(); vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => pdf())); });
  it('commits only validated PDFs and chooses detail from subscription', async () => {
    vi.mocked(resolveGuard).mockResolvedValue(guard('basic'));
    const response = await POST(req({ runId, detail: 'full', userId: 'fake' }), params);
    expect(response.status).toBe(200); expect(await response.text()).toContain('%PDF-');
    expect(fetch).toHaveBeenCalledWith(`http://trusted/api/intelligence/audits/12/report/pdf?run_id=${runId}&detail=basic`, expect.anything());
    expect(reserveContentGeneration).toHaveBeenCalledWith(expect.objectContaining({ feature: 'pdf_export', userId: 'u1', workspaceId: 'ws' }));
    expect(commitUsageOperation).toHaveBeenCalledTimes(1); expect(releaseUsageOperation).not.toHaveBeenCalled();
  });
  it('never reserves for invalid IDs, denied access or unsynced context', async () => {
    expect((await POST(req({ runId: '../id' }), params)).status).toBe(400);
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValue(1);
    expect((await POST(req(), params)).status).toBe(409);
    vi.mocked(resolveGuard).mockResolvedValue({ ok: false, response: NextResponse.json({}, { status: 403 }) });
    expect((await POST(req(), params)).status).toBe(403); expect(reserveContentGeneration).not.toHaveBeenCalled();
  });
  it('releases missing, wrong-run, malformed and failed documents', async () => {
    for (const response of [pdf('html'), pdf('%PDF-1.4 truncated'), pdf('%PDF-1.4', 'b'.repeat(32)), new Response('{}', { status: 409 })]) {
      vi.mocked(fetch).mockResolvedValueOnce(response);
      expect((await POST(req(), params)).status).toBeGreaterThanOrEqual(400);
    }
    expect(releaseUsageOperation).toHaveBeenCalledTimes(4); expect(commitUsageOperation).not.toHaveBeenCalled();
  });
  it('releases if Portal configuration changes during rendering', async () => {
    vi.mocked(prisma.projectContextOutbox.count).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    expect((await POST(req(), params)).status).toBe(409); expect(releaseUsageOperation).toHaveBeenCalledTimes(1);
  });
  it('replays committed requests without a second commit, and refuses changed requests', async () => {
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'replay', usageEventId: 'usage', status: 'committed' });
    expect((await POST(req(), params)).status).toBe(200); expect(commitUsageOperation).not.toHaveBeenCalled();
    vi.mocked(reserveContentGeneration).mockResolvedValue({ type: 'conflict' });
    expect((await POST(req(), params)).status).toBe(409);
  });
  it('preserves ambiguous commits for retry instead of releasing a possibly charged export', async () => {
    vi.mocked(commitUsageOperation).mockRejectedValue(new Error('unknown outcome'));
    expect((await POST(req(), params)).status).toBe(503);
    expect(markPendingReconcile).toHaveBeenCalledTimes(1); expect(releaseUsageOperation).not.toHaveBeenCalled();
  });
  it('keeps the operation retryable when a failed export cannot confirm its quota release', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 409 }));
    vi.mocked(releaseUsageOperation).mockRejectedValue(new Error('database unavailable'));
    expect((await POST(req(), params)).status).toBe(503);
    expect(commitUsageOperation).not.toHaveBeenCalled();
  });
});
