import { NextResponse } from 'next/server';

export async function GET() {
  // Stub — returns empty data until visibility service is connected
  return NextResponse.json({
    overallScore: null,
    mentionCount: 0,
    platformCoverage: [],
    competitorRank: null,
    suggestions: [],
    latestAuditDate: null,
  });
}
