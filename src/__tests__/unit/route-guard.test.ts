import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'user-1', email: 'user@example.com', name: 'Test User' },
  }),
}));

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('workspace-1'),
}));

vi.mock('@/lib/auth/workspace', () => ({
  getWorkspaceRole: vi.fn().mockResolvedValue('owner'),
  verifyProjectInWorkspace: vi.fn().mockResolvedValue({ id: 'project-1' }),
}));

vi.mock('@/lib/billing/guard', () => ({
  requireBilling: vi.fn().mockResolvedValue(undefined),
  BillingError: class extends Error {},
}));

vi.mock('@/lib/auth/service-jwt', () => ({
  issueVisibilityProjectJWT: vi.fn().mockResolvedValue('project-jwt'),
  issueVisibilityWorkspaceJWT: vi.fn().mockResolvedValue('workspace-jwt'),
}));

import { issueVisibilityProjectJWT, issueVisibilityWorkspaceJWT } from '@/lib/auth/service-jwt';
import { resolveGuard } from '@/lib/proxy/route-guard';

describe('resolveGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('issues a project-scoped Visibility JWT for project routes', async () => {
    const result = await resolveGuard(
      new NextRequest('http://localhost/api/integration/trends?projectId=project-1'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(issueVisibilityProjectJWT).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      role: 'owner',
    });
    expect(result.ctx.headers.Authorization).toBe('Bearer project-jwt');
  });

  it('issues a workspace-scoped Visibility JWT for non-project routes', async () => {
    const result = await resolveGuard(
      new NextRequest('http://localhost/api/integration/platforms'),
      { requireProject: false },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(issueVisibilityWorkspaceJWT).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      workspaceId: 'workspace-1',
      role: 'owner',
    });
    expect(result.ctx.headers.Authorization).toBe('Bearer workspace-jwt');
  });
});
