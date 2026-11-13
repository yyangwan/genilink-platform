import { logoutMiniProgram } from '@/lib/mini-program/identity';
import { miniJson, quickCheckRoute } from '@/lib/mini-program/quick-check-http';

export function POST(request: Request) {
  return quickCheckRoute(async () => {
    return miniJson(await logoutMiniProgram(request).then(() => ({ success: true })));
  });
}
