/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/onboarding/route';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth/config';

// Mocks are provided by setup.ts; we override per-test below

function mockRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create workspace + project + member in transaction', async () => {
    // Authenticated
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-new', email: 'new@example.com', name: 'New User' },
    });

    // No existing membership — triggers full transaction path
    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    // Mock the transaction to invoke the callback with a tx mock
    const txMock = {
      workspace: {
        create: vi.fn().mockResolvedValue({ id: 'ws-new', name: 'My Workspace' }),
      },
      workspaceMember: {
        create: vi.fn().mockResolvedValue({ id: 'wm-1' }),
      },
      project: {
        create: vi.fn().mockResolvedValue({ id: 'proj-new', name: 'My Project' }),
      },
      user: {
        update: vi.fn().mockResolvedValue({ id: 'user-new' }),
      },
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      return fn(txMock);
    });

    const req = mockRequest({
      workspaceName: 'My Workspace',
      projectName: 'My Project',
      projectUrl: 'https://example.com',
      industry: 'technology',
    });

    // Need to cast because our Request is not NextRequest, but the handler
    // only uses .json() which Request supports
    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.workspaceId).toBe('ws-new');
    expect(data.projectId).toBe('proj-new');

    // Verify transaction was called
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Verify all transaction steps executed
    expect(txMock.workspace.create).toHaveBeenCalledWith({
      data: { name: 'My Workspace', industry: 'technology' },
    });
    expect(txMock.workspaceMember.create).toHaveBeenCalledWith({
      data: { workspaceId: 'ws-new', userId: 'user-new', role: 'owner' },
    });
    expect(txMock.project.create).toHaveBeenCalledWith({
      data: {
        name: 'My Project',
        url: 'https://example.com',
        industry: 'technology',
        productName: null,
        productKeywords: [],
        productDescription: null,
        productUrl: null,
        workspaceId: 'ws-new',
      },
    });
    expect(txMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-new' },
      data: { onboardingCompleted: true, onboardingStep: 'completed' },
    });
  });

  it('should skip workspace creation if user already has one (idempotent)', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-existing', email: 'existing@example.com', name: 'Existing' },
    });

    // User already has a workspace membership
    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'wm-existing',
      userId: 'user-existing',
      workspaceId: 'ws-existing',
      workspace: { id: 'ws-existing', name: 'Existing Workspace', industry: null },
    });

    // User has not completed onboarding yet
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-existing',
      onboardingCompleted: false,
    });

    // No project yet in the workspace
    (prisma.project.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.project.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'proj-created',
      name: 'New Project',
    });

    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-existing' });
    (prisma.workspace.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'ws-existing' });

    const req = mockRequest({
      workspaceName: 'Ignored Name',
      projectName: 'New Project',
      industry: 'finance',
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.workspaceId).toBe('ws-existing');
    expect(data.projectId).toBe('proj-created');

    // Should NOT have called $transaction — uses the existing-workspace path
    expect(prisma.$transaction).not.toHaveBeenCalled();

    // Should create a project in the existing workspace
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'New Project',
        workspaceId: 'ws-existing',
      }),
    });

    // Should update user onboarding status
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-existing' },
      data: { onboardingCompleted: true, onboardingStep: 'completed' },
    });
  });

  it('should return skipped response when onboarding already completed', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-done', email: 'done@example.com', name: 'Done' },
    });

    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'wm-done',
      userId: 'user-done',
      workspaceId: 'ws-done',
      workspace: { id: 'ws-done', name: 'Done Workspace', industry: null },
    });

    // User already completed onboarding
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-done',
      onboardingCompleted: true,
    });

    const req = mockRequest({
      workspaceName: 'Whatever',
      projectName: 'Whatever',
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.workspaceId).toBe('ws-done');
    expect(data.projectId).toBeNull();
    expect(data.skipped).toBe(true);
  });

  it('should return 401 if not authenticated', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = mockRequest({
      workspaceName: 'Test',
      projectName: 'Test',
    });

    const res = await POST(req as any);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('should return 401 if session has no user id', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: {},
    });

    const req = mockRequest({
      workspaceName: 'Test',
      projectName: 'Test',
    });

    const res = await POST(req as any);

    expect(res.status).toBe(401);
  });

  it('should validate required fields', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-valid', email: 'valid@example.com', name: 'Valid' },
    });

    // Missing workspaceName
    const req1 = mockRequest({ projectName: 'Test' });
    const res1 = await POST(req1 as any);
    expect(res1.status).toBe(400);
    const data1 = await res1.json();
    expect(data1.error).toBe('Missing workspace name or project name');

    // Missing projectName
    const req2 = mockRequest({ workspaceName: 'Test' });
    const res2 = await POST(req2 as any);
    expect(res2.status).toBe(400);

    // Missing both
    const req3 = mockRequest({});
    const res3 = await POST(req3 as any);
    expect(res3.status).toBe(400);
  });

  it('should set workspace cookie in response', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-cookie', email: 'cookie@example.com', name: 'Cookie' },
    });

    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const txMock = {
      workspace: {
        create: vi.fn().mockResolvedValue({ id: 'ws-cookie', name: 'Cookie WS' }),
      },
      workspaceMember: {
        create: vi.fn().mockResolvedValue({ id: 'wm-c' }),
      },
      project: {
        create: vi.fn().mockResolvedValue({ id: 'proj-cookie', name: 'Cookie Proj' }),
      },
      user: {
        update: vi.fn().mockResolvedValue({ id: 'user-cookie' }),
      },
    };

    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(async (fn) => {
      return fn(txMock);
    });

    const req = mockRequest({
      workspaceName: 'Cookie WS',
      projectName: 'Cookie Proj',
    });

    const res = await POST(req as any);

    // Verify cookie is set (NextResponse stores cookies internally)
    const setCookieHeader = res.headers.get('set-cookie');
    expect(setCookieHeader).toContain('genilink-workspace=ws-cookie');
  });
});
