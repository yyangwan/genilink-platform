import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: { $queryRaw: vi.fn(), project: { findUnique: vi.fn() }, projectContextOutbox: { findUnique: vi.fn(), updateMany: vi.fn() } } }));
vi.mock('@/lib/visibility/project-brand-associations', () => ({ attemptAssociationDelivery: vi.fn() }));
import { prisma } from '@/lib/db';
import { attemptAssociationDelivery } from '@/lib/visibility/project-brand-associations';
import { retryProjectContexts } from '@/lib/visibility/context-retry';
import { POST } from '@/app/api/internal/visibility/context-sync/route';
describe('pending context background retries', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(prisma.$queryRaw).mockResolvedValue([{ id: 'event', projectId: 'project', createdBy: 'actor', attempts: 10 }]); vi.mocked(prisma.project.findUnique).mockResolvedValue({ workspaceId: 'workspace' } as never); vi.mocked(prisma.projectContextOutbox.findUnique).mockResolvedValue({ deliveredAt: null } as never); });
  it('backs off unconfirmed delivery without losing the task or logging credentials', async () => { const started = Date.now(); expect((await retryProjectContexts())[0].status).toBe('pending'); const input = vi.mocked(prisma.projectContextOutbox.updateMany).mock.calls[0][0]; expect(input.where).toEqual({ id: 'event', deliveredAt: null }); expect(input.data).toMatchObject({ attempts: { increment: 1 }, lastErrorCode: 'sync_not_confirmed' }); expect((input.data.nextAttemptAt as Date).getTime() - started).toBeGreaterThanOrEqual(3600000); });
  it('does not overwrite successful delivery with a failure backoff', async () => { vi.mocked(prisma.projectContextOutbox.findUnique).mockResolvedValue({ deliveredAt: new Date() } as never); expect((await retryProjectContexts())[0].status).toBe('delivered'); expect(prisma.projectContextOutbox.updateMany).not.toHaveBeenCalled(); });
  it('does not dispatch a task for a project that no longer exists', async () => { vi.mocked(prisma.project.findUnique).mockResolvedValue(null); await retryProjectContexts(); expect(attemptAssociationDelivery).not.toHaveBeenCalled(); });
  it('requires a configured dedicated service secret for scheduler calls', async () => { vi.stubEnv('VISIBILITY_CONTEXT_SYNC_SECRET', 'fake-retry-secret'); const request = (secret: string) => new Request('http://localhost/api/internal/visibility/context-sync', { method: 'POST', headers: { Authorization: secret } }); expect((await POST(request('wrong'))).status).toBe(401); expect(prisma.$queryRaw).not.toHaveBeenCalled(); expect((await POST(request('Bearer fake-retry-secret'))).status).toBe(200); });
});
