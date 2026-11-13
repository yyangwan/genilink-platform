import { prisma } from '@/lib/db';
import { requireMiniProgramSession } from '@/lib/mini-program/identity';
import { findVisitor, reportAccess, reportEvent } from '@/lib/mini-program/quick-checks';
import { miniJson, quickCheckRoute } from '@/lib/mini-program/quick-check-http';

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return quickCheckRoute(async () => {
    const [{ id }, visitor, session] = await Promise.all([params, findVisitor(request), requireMiniProgramSession(request)]);
    const report = await reportAccess(id, visitor?.id, session?.userId);
    if (report.status === 'completed') {
      await prisma.$transaction((tx) => reportEvent(tx, report, report.acquisitionSession, 'mini_quick_check_viewed', session?.userId));
    }
    return miniJson({ success: true });
  });
}
