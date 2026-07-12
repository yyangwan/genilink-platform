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
import { GET as listSchedules, POST as createSchedule } from '@/app/api/integration/schedules/route';
import {
  DELETE as deleteSchedule,
  GET as getSchedule,
  PATCH as updateSchedule,
} from '@/app/api/integration/schedules/[id]/route';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const getUpstreamRequest = () => mockFetch.mock.calls[0]?.[0] as Request | undefined;

describe('GET /api/integration/schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a workspace-scoped JWT for listing schedules', async () => {
    mockFetch.mockResolvedValueOnce(Response.json([]));

    const res = await listSchedules(
      new NextRequest('http://localhost/api/integration/schedules?projectId=project-1'),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual([]);
    expect(issueVisibilityWorkspaceJWT).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      workspaceId: 'workspace-1',
      role: 'owner',
    });
    expect(issueVisibilityProjectJWT).not.toHaveBeenCalled();

    const upstreamRequest = getUpstreamRequest();
    expect(upstreamRequest?.url).toBe('http://127.0.0.1:8000/api/schedules');
    expect(upstreamRequest?.headers.get('authorization')).toBe(
      'Bearer workspace-jwt',
    );
  });
});

describe('POST /api/integration/schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a project-scoped JWT when creating a schedule', async () => {
    mockFetch.mockResolvedValueOnce(Response.json({ id: 10 }));

    const res = await createSchedule(
      new NextRequest('http://localhost/api/integration/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'project-1', cron_expression: '0 9 * * *' }),
      }),
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ id: 10 });
    expect(issueVisibilityProjectJWT).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      role: 'owner',
    });

    const upstreamRequest = getUpstreamRequest();
    expect(upstreamRequest?.url).toBe('http://127.0.0.1:8000/api/schedules');
    expect(upstreamRequest?.headers.get('authorization')).toBe(
      'Bearer project-jwt',
    );
    expect(await upstreamRequest?.text()).toBe(
      JSON.stringify({ project_id: 'project-1', cron_expression: '0 9 * * *' }),
    );
  });
});

describe('GET /api/integration/schedules/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a project-scoped JWT for reading a schedule', async () => {
    mockFetch.mockResolvedValueOnce(Response.json({ id: 10 }));

    const res = await getSchedule(
      new NextRequest('http://localhost/api/integration/schedules/10?projectId=project-1'),
      { params: Promise.resolve({ id: '10' }) },
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ id: 10 });
    expect(issueVisibilityProjectJWT).toHaveBeenCalledWith({
      userId: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      workspaceId: 'workspace-1',
      projectId: 'project-1',
      role: 'owner',
    });
    expect(issueVisibilityWorkspaceJWT).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/integration/schedules/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a project-scoped JWT when updating a schedule', async () => {
    mockFetch.mockResolvedValueOnce(Response.json({ id: 10 }));

    const res = await updateSchedule(
      new NextRequest('http://localhost/api/integration/schedules/10?projectId=project-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: false }),
      }),
      { params: Promise.resolve({ id: '10' }) },
    );

    expect(res.status).toBe(200);
    expect(issueVisibilityProjectJWT).toHaveBeenCalled();
    expect(issueVisibilityWorkspaceJWT).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/integration/schedules/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses a project-scoped JWT when deleting a schedule', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const res = await deleteSchedule(
      new NextRequest('http://localhost/api/integration/schedules/10?projectId=project-1', {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: '10' }) },
    );

    expect(res.status).toBe(204);
    expect(issueVisibilityProjectJWT).toHaveBeenCalled();
    expect(issueVisibilityWorkspaceJWT).not.toHaveBeenCalled();
  });
});
