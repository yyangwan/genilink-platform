import { NextResponse } from 'next/server';

export async function GET() {
  // Stub — returns empty data until geo service is connected
  return NextResponse.json({
    websites: [],
    totalCitations: 0,
    avgAiScore: null,
    optimizationTasks: [],
  });
}
