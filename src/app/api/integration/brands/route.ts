import { NextRequest, NextResponse } from 'next/server';
import { withBrandRoute } from '@/lib/auth/brand-route';
import { resolveBrandProject, proxyBrandFetch, transformBrandBody } from '@/lib/proxy/brand-proxy';

export const GET = withBrandRoute(async (req, { userId, workspaceId }) => {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const result = await resolveBrandProject(projectId, userId, workspaceId);
  if (!result.ok) return result.response;

  return proxyBrandFetch('GET', `/api/projects/${result.projectPk}/brands`, { timeoutMs: 15_000 });
});

export const POST = withBrandRoute(async (req, { userId, workspaceId }) => {
  const body = await req.json();
  const projectId = body.projectId || req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const result = await resolveBrandProject(projectId, userId, workspaceId);
  if (!result.ok) return result.response;

  const { projectId: _, ...rest } = body;
  return proxyBrandFetch('POST', `/api/projects/${result.projectPk}/brands`, {
    body: transformBrandBody(rest),
  });
});

export const PATCH = withBrandRoute(async (req, { userId, workspaceId }) => {
  const body = await req.json();
  const projectId = body.projectId || req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const result = await resolveBrandProject(projectId, userId, workspaceId);
  if (!result.ok) return result.response;

  const { projectId: _, ...rest } = body;
  return proxyBrandFetch('PATCH', `/api/projects/${result.projectPk}/brands`, {
    body: transformBrandBody(rest),
  });
});
