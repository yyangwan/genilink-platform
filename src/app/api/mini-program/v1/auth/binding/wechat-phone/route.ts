import { registerWithWechatPhone } from '@/lib/mini-program/identity';
import { miniJson, quickCheckRoute, readMiniBody } from '@/lib/mini-program/quick-check-http';

export function POST(request: Request) {
  return quickCheckRoute(async () => miniJson(await registerWithWechatPhone(request, await readMiniBody(request))));
}
