import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';
import { prisma } from '@/lib/db';
import { createBrandForProject } from '@/lib/brand-helpers';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await req.json();
  const { workspaceName, industry, projectName, projectUrl, productName, productKeywords, productDescription, productUrl, brandName } = body;

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
          productName: productName || null,
          productKeywords: productKeywords || [],
          productDescription: productDescription || null,
          productUrl: productUrl || null,
          workspaceId: workspace.id,
        },
      });
    }

    // Auto-create own brand if brandName provided
    if (brandName?.trim()) {
      await createBrandForProject(brandName, project.id, workspace.id);
    }

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
        productName: productName || null,
        productKeywords: productKeywords || [],
        productDescription: productDescription || null,
        productUrl: productUrl || null,
        workspaceId: workspace.id,
      },
    });

    // 4. Mark user onboarding as completed
    await tx.user.update({
      where: { id: userId },
      data: {
        onboardingCompleted: true,
        onboardingStep: 'completed',
      },
    });

    return { workspaceId: workspace.id, projectId: project.id };
  });

  // Auto-create own brand if brandName provided (outside transaction — HTTP sync is non-deterministic)
  if (brandName?.trim()) {
    await createBrandForProject(brandName, result.projectId, result.workspaceId);
  }

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
