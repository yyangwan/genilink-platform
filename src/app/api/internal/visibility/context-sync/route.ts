import { NextResponse } from 'next/server';
import { verifyInternalServiceAuth } from '@/lib/auth/internal-service-auth';
import { retryProjectContexts } from '@/lib/visibility/context-retry';
export async function POST(req: Request) {
  const auth = verifyInternalServiceAuth(req, 'VISIBILITY_CONTEXT_SYNC_SECRET');
  if (!auth.ok) return auth.response;
  try { return NextResponse.json({ results: await retryProjectContexts() }); }
  catch { return NextResponse.json({ error: 'context_retry_unavailable' }, { status: 503 }); }
}
