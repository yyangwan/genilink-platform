import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { cookies } from 'next/headers';

// GET /api/notifications — fetch recent notifications (mock until backend SSE is ready)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Return empty notifications — will be populated when backend SSE endpoint is ready
  return NextResponse.json({
    notifications: [],
    unreadCount: 0,
  });
}

// PATCH /api/notifications — mark notification(s) as read
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { ids, markAll } = body as { ids?: string[]; markAll?: boolean };

  // No-op until backend notification service is wired
  return NextResponse.json({ success: true, marked: markAll ? 'all' : ids?.length || 0 });
}
