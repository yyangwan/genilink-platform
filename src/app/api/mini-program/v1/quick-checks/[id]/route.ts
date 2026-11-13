import { requireMiniProgramSession } from '@/lib/mini-program/identity';
import { findVisitor, reportAccess, reportOutput } from '@/lib/mini-program/quick-checks';
import { miniJson, quickCheckRoute } from '@/lib/mini-program/quick-check-http';

export function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return quickCheckRoute(async () => {
    const [{ id }, visitor, session] = await Promise.all([params, findVisitor(request), requireMiniProgramSession(request)]);
    return miniJson(reportOutput(await reportAccess(id, visitor?.id, session?.userId)));
  });
}
