import { prisma } from '@/lib/db';
import { Prisma } from '@/generated/prisma/client';
import { attemptAssociationDelivery } from './project-brand-associations';
export async function retryProjectContexts() {
  const events = await prisma.$queryRaw<Array<{ id: string; projectId: string; createdBy: string; attempts: number }>>(Prisma.sql`
    SELECT id, "projectId", "createdBy", attempts FROM (
      SELECT DISTINCT ON ("projectId") id, "projectId", "createdBy", attempts, "nextAttemptAt", "createdAt"
      FROM "ProjectContextOutbox" WHERE "deliveredAt" IS NULL ORDER BY "projectId", version
    ) pending WHERE "nextAttemptAt" IS NULL OR "nextAttemptAt" <= CURRENT_TIMESTAMP
    ORDER BY "createdAt", id LIMIT 3`);
  const results = [];
  for (const event of events) {
    const project = await prisma.project.findUnique({ where: { id: event.projectId }, select: { workspaceId: true } });
    if (project) await attemptAssociationDelivery({ projectId: event.projectId, workspaceId: project.workspaceId, userId: event.createdBy });
    const latest = await prisma.projectContextOutbox.findUnique({ where: { id: event.id } });
    const delivered = !!latest?.deliveredAt;
    if (!delivered) {
      const delay = Math.min(3600000, 30000 * 2 ** Math.min(event.attempts, 7));
      await prisma.projectContextOutbox.updateMany({ where: { id: event.id, deliveredAt: null }, data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + delay), lastErrorCode: 'sync_not_confirmed' } });
    }
    results.push({ eventId: event.id, projectId: event.projectId, status: delivered ? 'delivered' : 'pending' });
  }
  return results;
}
