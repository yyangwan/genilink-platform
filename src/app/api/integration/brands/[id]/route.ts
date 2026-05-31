import { NextResponse } from 'next/server';

// Brands are now managed via /api/brands directly — these routes are decommissioned
export async function DELETE() {
  return NextResponse.json(
    { error: 'Use /api/brands to delete brands' },
    { status: 410 },
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Use /api/brands to update brands' },
    { status: 410 },
  );
}
