import { verifyBindingSms } from '@/lib/mini-program/identity';
import { miniJson, quickCheckRoute, readMiniBody } from '@/lib/mini-program/quick-check-http';

export function POST(request: Request) {
  return quickCheckRoute(async () => {
    const body = await readMiniBody(request);
    return miniJson(await verifyBindingSms(request, body.phone, body.code));
  });
}
