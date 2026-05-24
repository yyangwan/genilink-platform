import { NextRequest, NextResponse } from 'next/server';
import { withBrandRoute } from '@/lib/auth/brand-route';
import { resolveBrandProject, proxyBrandFetch, transformBrandBody } from '@/lib/proxy/brand-proxy';

export const DELETE = withBrandRoute(async (req, { userId, workspaceId }, params) => {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const result = await resolveBrandProject(projectId, userId, workspaceId);
  if (!result.ok) return result.response;

  const { id } = params!;
  return proxyBrandFetch('DELETE', `/api/projects/${result.projectPk}/brands/${id}`);
});

export const PATCH = withBrandRoute(async (req, { userId, workspaceId }, params) => {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
  }

  const result = await resolveBrandProject(projectId, userId, workspaceId);
  if (!result.ok) return result.response;

  const { id } = params!;
  const body = await req.json();
  return proxyBrandFetch('PATCH', `/api/projects/${result.projectPk}/brands/${id}`, {
    body: transformBrandBody(body),
  });
});
