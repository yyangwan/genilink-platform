import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { cookies } from 'next/headers';
import { proxyRequest } from '@/lib/proxy/zhijian-client';

// GET /api/dashboard/visibility — fetch real visibility data from 智見
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get('genilink-workspace')?.value;

  if (!workspaceId) {
    return NextResponse.json({ overallScore: null, mentionCount: 0, platformCoverage: [], competitorRank: null, suggestions: [], latestAuditDate: null });
  }

  // Get the project filter (optional)
  const projectId = req.nextUrl.searchParams.get('project');

  // Find projects in workspace
  const projects = await prisma.project.findMany({
    where: projectId ? { id: projectId, workspaceId } : { workspaceId },
    include: { externalMappings: true },
    take: 1,
  });

  if (projects.length === 0) {
    return NextResponse.json({ overallScore: null, mentionCount: 0, platformCoverage: [], competitorRank: null, suggestions: [], latestAuditDate: null });
  }

  const project = projects[0];
  const visibilityMapping = project.externalMappings.find((m) => m.service === 'visibility');

  if (!visibilityMapping) {
    return NextResponse.json({ overallScore: null, mentionCount: 0, platformCoverage: [], competitorRank: null, suggestions: [], latestAuditDate: null });
  }

  // Try to fetch real data from 智見 backend
  try {
    const data = await proxyRequest({
      projectId: project.id,
      service: 'visibility',
      path: '/api/v1/projects/:id/summary',
    });

    // Transform 智見 data to dashboard format
    const result = data as Record<string, unknown>;
    return NextResponse.json({
      overallScore: (result.overall_score as number) ?? null,
      mentionCount: (result.mention_count as number) ?? 0,
      platformCoverage: Array.isArray(result.platform_coverage)
        ? result.platform_coverage
        : [],
      competitorRank: (result.competitor_rank as number) ?? null,
      suggestions: Array.isArray(result.suggestions)
        ? result.suggestions
        : [],
      latestAuditDate: (result.latest_audit_date as string) ?? null,
    });
  } catch {
    // If backend is unreachable, return empty data (not an error)
    return NextResponse.json({ overallScore: null, mentionCount: 0, platformCoverage: [], competitorRank: null, suggestions: [], latestAuditDate: null });
  }
}
