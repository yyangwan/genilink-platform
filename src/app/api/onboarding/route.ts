import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { nanoid } from 'nanoid';

const VISIBILITY_URL = process.env.VISIBILITY_SERVICE_URL || 'http://127.0.0.1:8000';

/**
 * Create a project on the visibility service and return its integer ID.
 * Falls back to nanoid if the service is unavailable.
 */
async function createVisibilityProject(
  name: string,
  industry?: string | null,
): Promise<string> {
  const serviceToken = process.env.SERVICE_TOKEN;
  if (!serviceToken) return nanoid(12);

  try {
    const res = await fetch(`${VISIBILITY_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({ name, industry: industry || undefined }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const data = await res.json();
      return String(data.id);
    }
  } catch {
    // Service unavailable — fall back to nanoid
  }

  return nanoid(12);
}

/**
 * Ensure external mappings exist for a project. Creates them if missing.
 */
async function ensureMappings(
  projectId: string,
  projectName: string,
  industry?: string | null,
): Promise<void> {
  const existing = await prisma.externalResourceMapping.findMany({
    where: { projectId },
  });

  const hasVisibility = existing.some((m) => m.service === 'visibility');
  const hasContent = existing.some((m) => m.service === 'content');

  const toCreate: { projectId: string; service: 'visibility' | 'content'; externalId: string }[] = [];

  if (!hasVisibility) {
    const externalId = await createVisibilityProject(projectName, industry);
    toCreate.push({ projectId, service: 'visibility', externalId });
  }

  if (!hasContent) {
    toCreate.push({ projectId, service: 'content', externalId: nanoid(12) });
  }

  if (toCreate.length > 0) {
    await prisma.externalResourceMapping.createMany({ data: toCreate });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json();
  const { workspaceName, industry, projectName, projectUrl } = body;

  if (!workspaceName || !projectName) {
    return NextResponse.json(
      { error: 'Missing workspace name or project name' },
      { status: 400 },
    );
  }

  // ─── Idempotent check: does this user already have a workspace? ───
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: { userId },
    include: { workspace: true },
  });

  if (existingMembership) {
    const workspace = existingMembership.workspace;

    // Check if onboarding already completed
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.onboardingCompleted) {
      return NextResponse.json({
        workspaceId: workspace.id,
        projectId: null,
        skipped: true,
      });
    }

    // Workspace exists (e.g., from WeChat login) — create project if needed
    let project = await prisma.project.findFirst({
      where: { workspaceId: workspace.id },
    });

    if (!project) {
      project = await prisma.project.create({
        data: {
          name: projectName,
          url: projectUrl || null,
          industry: industry || null,
          workspaceId: workspace.id,
        },
      });
    }

    // Ensure external mappings (creates project on visibility service)
    await ensureMappings(project.id, project.name, industry);

    // Update user onboarding status
    await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingCompleted: true,
        onboardingStep: 'completed',
      },
    });

    // Update workspace industry if provided
    if (industry && !workspace.industry) {
      await prisma.workspace.update({
        where: { id: workspace.id },
        data: { industry },
      });
    }

    // Set workspace cookie via response
    const response = NextResponse.json({
      workspaceId: workspace.id,
      projectId: project.id,
    });

    response.cookies.set('genilink-workspace', workspace.id, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  }

  // ─── Transactional: create workspace + member + project + mapping ───
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create workspace
    const workspace = await tx.workspace.create({
      data: {
        name: workspaceName,
        industry: industry || null,
      },
    });

    // 2. Create workspace member (owner)
    await tx.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId,
        role: 'owner',
      },
    });

    // 3. Create project
    const project = await tx.project.create({
      data: {
        name: projectName,
        url: projectUrl || null,
        industry: industry || null,
        workspaceId: workspace.id,
      },
    });

    // 4. Create project on visibility service and store its integer ID
    const visibilityExternalId = await createVisibilityProject(projectName, industry);

    await tx.externalResourceMapping.createMany({
      data: [
        {
          projectId: project.id,
          service: 'visibility',
          externalId: visibilityExternalId,
        },
        {
          projectId: project.id,
          service: 'content',
          externalId: nanoid(12),
        },
      ],
    });

    // 5. Mark user onboarding as completed
    await tx.user.update({
      where: { id: userId },
      data: {
        onboardingCompleted: true,
        onboardingStep: 'completed',
      },
    });

    return { workspaceId: workspace.id, projectId: project.id };
  });

  const response = NextResponse.json(result);

  response.cookies.set('genilink-workspace', result.workspaceId, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 365 * 24 * 60 * 60,
    path: '/',
  });

  return response;
}
