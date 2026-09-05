import { NextResponse } from 'next/server';

const ERROR_MAP: Record<string, { error: string; status: number }> = {
  TIMEOUT: { error: 'Upstream timeout', status: 504 },
  NOT_FOUND: { error: 'Not found', status: 404 },
  AUTH_EXPIRED: { error: 'Service auth expired', status: 502 },
  PLATFORM_AUTH_REQUIRED: { error: '发布平台授权已失效，请前往“发布平台”检查凭证或刷新授权。', status: 400 },
  PLATFORM_PUBLISH_FAILED: { error: '发布失败，请检查文章内容、封面图片及平台权限后重试。', status: 400 },
  ACCESS_DENIED: { error: 'Access denied', status: 403 },
};

export function handleProxyError(err: unknown, fallbackMessage = 'Failed to connect to content service'): NextResponse {
  const message = (err as Error).message;
  const mapped = ERROR_MAP[message];
  if (mapped) {
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 502 });
}
