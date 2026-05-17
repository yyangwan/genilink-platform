import { NextResponse } from 'next/server';

export async function GET() {
  // Stub — returns empty data until content service is connected
  return NextResponse.json({
    totalContent: 0,
    publishedCount: 0,
    recentContent: [],
    qualityAvg: null,
  });
}
