import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/billing/guard', () => ({
  requireBilling: vi.fn(),
  BillingError: class BillingError extends Error {
    module: string;
    statusCode: number;
    constructor(module: string) { super(`No active subscription for module: ${module}`); this.name = 'BillingError'; this.module = module; this.statusCode = 403; }
  },
}));

vi.mock('@/lib/auth/workspace', () => ({
  verifyProjectInWorkspace: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMember: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/proxy/zhijian-client', () => ({
  getExternalId: vi.fn(),
}));

vi.mock('@/lib/auth/service-jwt', () => ({
  issueServiceJWT: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { auth } from '@/lib/auth/config';
import { requireBilling } from '@/lib/billing/guard';
import { verifyProjectInWorkspace } from '@/lib/auth/workspace';
import { withContentAuth } from '@/lib/auth/content-auth';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { getExternalId } from '@/lib/proxy/zhijian-client';
import { issueServiceJWT } from '@/lib/auth/service-jwt';

function mockRequest(url: string, method = 'GET', body?: unknown) {
  const req = new NextRequest(new URL(url, 'http://localhost'), {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (body) {
    req.json = async () => body;
  }
  return req;
}

function setupSuccessMocks() {
  (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
  (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
  });
  (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
  (requireBilling as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    role: 'owner',
  });
  (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('ext-123');
  (issueServiceJWT as ReturnType<typeof vi.fn>).mockResolvedValue('dynamic-jwt');
}

describe('withContentAuth', () => {
  const handler = vi.fn().mockResolvedValue(new Response('ok'));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when no session', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const wrapped = withContentAuth(handler, { action: 'read' });
    const res = await wrapped(mockRequest('http://localhost/api/content'));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return 400 when no workspace cookie', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => undefined,
    });
    const wrapped = withContentAuth(handler, { action: 'read' });
    const res = await wrapped(mockRequest('http://localhost/api/content'));
    expect(res.status).toBe(400);
  });

  it('should return 400 when no projectId', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    const wrapped = withContentAuth(handler, { action: 'read' });
    const res = await wrapped(mockRequest('http://localhost/api/content'));
    expect(res.status).toBe(400);
  });

  it('should return 403 when project not in workspace', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const wrapped = withContentAuth(handler, { action: 'read' });
    const res = await wrapped(mockRequest('http://localhost/api/content?projectId=p1'));
    expect(res.status).toBe(403);
  });

  it('should return 403 when billing check fails', async () => {
    const { BillingError } = await import('@/lib/billing/guard');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('ext-123');
    (requireBilling as ReturnType<typeof vi.fn>).mockRejectedValue(new BillingError('content'));

    const wrapped = withContentAuth(handler, { action: 'read' });
    const res = await wrapped(mockRequest('http://localhost/api/content?projectId=p1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('NO_SUBSCRIPTION');
  });

  it('should return 403 when role lacks permission', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue('ext-123');
    (requireBilling as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'member',
    });

    const wrapped = withContentAuth(handler, { action: 'delete' });
    const res = await wrapped(mockRequest('http://localhost/api/content?projectId=p1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Insufficient permissions');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return 404 when no external mapping exists', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    (getExternalId as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const wrapped = withContentAuth(handler, { action: 'read' });
    const res = await wrapped(mockRequest('http://localhost/api/content?projectId=p1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('No external mapping for project');
    expect(handler).not.toHaveBeenCalled();
  });

  it('should pass context with externalId to handler on success', async () => {
    setupSuccessMocks();

    const wrapped = withContentAuth(handler, { action: 'read' });
    const req = mockRequest('http://localhost/api/content?projectId=p1');
    await wrapped(req);

    expect(handler).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1', projectId: 'p1', role: 'owner', externalId: 'ext-123', serviceToken: 'dynamic-jwt' },
      req,
    );
  });

  it('should extract projectId from POST body', async () => {
    setupSuccessMocks();

    const wrapped = withContentAuth(handler, { action: 'write' });
    const req = mockRequest('http://localhost/api/content', 'POST', { projectId: 'p1', title: 'test' });
    await wrapped(req);

    expect(handler).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1', projectId: 'p1', role: 'owner', externalId: 'ext-123', serviceToken: 'dynamic-jwt' },
      req,
    );
  });
});
