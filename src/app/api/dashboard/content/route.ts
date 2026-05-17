import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { proxyRequest } from '@/lib/proxy/zhijian-client';

const emptyData = { totalContent: 0, publishedCount: 0, recentContent: [], qualityAvg: null };

// GET /api/dashboard/content — fetch real content data from 智創
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;

  if (!workspaceId) {
    return NextResponse.json(emptyData);
  }

  const projectId = req.nextUrl.searchParams.get('project');

  const projects = await prisma.project.findMany({
    where: projectId ? { id: projectId, workspaceId } : { workspaceId },
    include: { externalMappings: true },
    take: 1,
  });

  if (projects.length === 0) {
    return NextResponse.json(emptyData);
  }

  const project = projects[0];
  const contentMapping = project.externalMappings.find((m) => m.service === 'content');

  if (!contentMapping) {
    return NextResponse.json(emptyData);
  }

  try {
    const data = await proxyRequest({
      projectId: project.id,
      service: 'content',
      path: '/api/v1/projects/:id/content-summary',
    });

    const result = data as Record<string, unknown>;
    return NextResponse.json({
      totalContent: (result.total_content as number) ?? 0,
      publishedCount: (result.published_count as number) ?? 0,
      recentContent: Array.isArray(result.recent_content) ? result.recent_content : [],
      qualityAvg: (result.quality_avg as number) ?? null,
    });
  } catch {
    return NextResponse.json(emptyData);
  }
}
