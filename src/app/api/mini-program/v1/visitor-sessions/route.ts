import { createVisitor } from '@/lib/mini-program/quick-checks';
import { miniJson, quickCheckRoute, readMiniBody, requireQuickCheckEnabled } from '@/lib/mini-program/quick-check-http';

export function POST(request: Request) {
  return quickCheckRoute(async () => {
    requireQuickCheckEnabled();
    const body = await readMiniBody(request);
    return miniJson(await createVisitor(request, body.channel));
  });
}
