import { NextRequest, NextResponse } from 'next/server';
import { OpsAuthorizationError, requireOps } from '@/lib/auth/ops';
import { getConversionSummary } from '@/lib/marketing/conversion';

export async function GET(request: NextRequest) {
  try {
    await requireOps();
    const requestedDays = Number(request.nextUrl.searchParams.get('days') || 30);
    const summary = await getConversionSummary(requestedDays);
    return NextResponse.json({ summary }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof OpsAuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Failed to read conversion summary', error);
    return NextResponse.json({ error: 'CONVERSION_READ_FAILED' }, { status: 500 });
  }
}
