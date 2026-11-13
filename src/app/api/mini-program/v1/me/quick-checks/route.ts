import { prisma } from '@/lib/db';
import { requireMiniProgramSession } from '@/lib/mini-program/identity';
import { reportOutput } from '@/lib/mini-program/quick-checks';
import { miniJson, QuickCheckError, quickCheckRoute } from '@/lib/mini-program/quick-check-http';

export function GET(request: Request) {
  return quickCheckRoute(async () => {
    const session = await requireMiniProgramSession(request);
    if (!session) throw new QuickCheckError(401, 'UNAUTHORIZED', '请先登录智链');
    const cursor = new URL(request.url).searchParams.get('cursor');
    if (cursor && !await prisma.websiteQuickCheck.findFirst({ where: { id: cursor, ownerUserId: session.userId }, select: { id: true } })) {
      throw new QuickCheckError(400, 'INVALID_CURSOR', '报告列表已更新，请刷新');
    }
    const reports = await prisma.websiteQuickCheck.findMany({
      where: { ownerUserId: session.userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return miniJson({ items: reports.slice(0, 20).map(reportOutput), nextCursor: reports.length > 20 ? reports[19].id : undefined });
  });
}
