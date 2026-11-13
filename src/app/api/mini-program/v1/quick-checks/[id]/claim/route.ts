import { requireMiniProgramSession } from '@/lib/mini-program/identity';
import { claimQuickCheck, findVisitor, reportOutput } from '@/lib/mini-program/quick-checks';
import { miniJson, QuickCheckError, quickCheckRoute } from '@/lib/mini-program/quick-check-http';

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return quickCheckRoute(async () => {
    const [{ id }, visitor, session] = await Promise.all([params, findVisitor(request), requireMiniProgramSession(request)]);
    if (!session) throw new QuickCheckError(401, 'UNAUTHORIZED', '请先登录智链');
    return miniJson(reportOutput(await claimQuickCheck(id, visitor?.id, session.userId)));
  });
}
