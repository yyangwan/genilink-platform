import { exchangeWechat } from '@/lib/mini-program/identity';
import { miniJson, quickCheckRoute, readMiniBody } from '@/lib/mini-program/quick-check-http';

export function POST(request: Request) {
  return quickCheckRoute(async () => {
    return miniJson(await exchangeWechat(request, (await readMiniBody(request)).code));
  });
}
