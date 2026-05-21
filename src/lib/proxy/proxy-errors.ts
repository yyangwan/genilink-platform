import { NextResponse } from 'next/server';

const ERROR_MAP: Record<string, { error: string; status: number }> = {
  TIMEOUT: { error: 'Upstream timeout', status: 504 },
  NOT_FOUND: { error: 'Not found', status: 404 },
  AUTH_EXPIRED: { error: 'Service auth expired', status: 502 },
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
