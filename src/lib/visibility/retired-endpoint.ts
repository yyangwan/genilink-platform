import { NextResponse } from 'next/server';

/** Static retirement response: never proxies, generates analysis, or consumes quota. */
export function retiredVisibilityEndpoint(replacement: string) {
  return NextResponse.json({ error: 'VISIBILITY_ENDPOINT_RETIRED', message: '旧分析口径已停止使用，请通过新版页面查看证据分析。', replacement }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
