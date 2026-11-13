import { findVisitor, reportOutput, runQuickCheck } from '@/lib/mini-program/quick-checks';
import { miniJson, QuickCheckError, quickCheckRoute, readMiniBody, requireQuickCheckEnabled } from '@/lib/mini-program/quick-check-http';

export function POST(request: Request) {
  return quickCheckRoute(async () => {
    requireQuickCheckEnabled();
    const visitor = await findVisitor(request);
    if (!visitor) throw new QuickCheckError(401, 'VISITOR_EXPIRED', '请重新打开快检');
    const body = await readMiniBody(request);
    const { report, created } = await runQuickCheck(request, visitor, body.url);
    return miniJson(reportOutput(report), report.status === 'running' ? 202 : created ? 201 : 200);
  });
}
