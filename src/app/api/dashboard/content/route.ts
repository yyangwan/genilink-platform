import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';

// GET /api/dashboard/content — content summary (placeholder until 智創 service is ready)
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;

  if (!workspaceId) {
    return NextResponse.json({ totalContent: 0, publishedCount: 0, recentContent: [], qualityAvg: null });
  }

  const projectId = req.nextUrl.searchParams.get('project');

  // Count projects as a proxy for activity
  const projectCount = await prisma.project.count({
    where: projectId ? { id: projectId, workspaceId } : { workspaceId },
  });

  // Content service not yet connected — return structured empty state
  return NextResponse.json({
    totalContent: 0,
    publishedCount: 0,
    recentContent: [],
    qualityAvg: null,
    _meta: {
      projectCount,
      serviceAvailable: false,
    },
  });
}
