import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing
vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/billing/guard', () => ({
  requireBilling: vi.fn(),
  BillingError: class BillingError extends Error {
    constructor() { super('Billing required'); this.name = 'BillingError'; }
  },
}));

vi.mock('@/lib/auth/workspace', () => ({
  verifyProjectInWorkspace: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {},
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

function mockRequest(url: string, method = 'GET', body?: unknown) {
  const req = new NextRequest(new URL(url, 'http://localhost'), {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
  // Stub json() for non-GET
  if (body) {
    req.json = async () => body;
  }
  return req;
}

describe('withContentAuth', () => {
  const handler = vi.fn().mockResolvedValue(new Response('ok'));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when no session', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const wrapped = withContentAuth(handler);
    const res = await wrapped(mockRequest('http://localhost/api/content'));
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return 400 when no workspace cookie', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: () => undefined,
    });
    const wrapped = withContentAuth(handler);
    const res = await wrapped(mockRequest('http://localhost/api/content'));
    expect(res.status).toBe(400);
  });

  it('should return 400 when no projectId', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    const wrapped = withContentAuth(handler);
    const res = await wrapped(mockRequest('http://localhost/api/content'));
    expect(res.status).toBe(400);
  });

  it('should return 403 when project not in workspace', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const wrapped = withContentAuth(handler);
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
    (requireBilling as ReturnType<typeof vi.fn>).mockRejectedValue(new BillingError());

    const wrapped = withContentAuth(handler);
    const res = await wrapped(mockRequest('http://localhost/api/content?projectId=p1'));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('NO_SUBSCRIPTION');
  });

  it('should pass context to handler on success', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    (requireBilling as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const wrapped = withContentAuth(handler);
    const req = mockRequest('http://localhost/api/content?projectId=p1');
    await wrapped(req);

    expect(handler).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1', projectId: 'p1' },
      req,
    );
  });

  it('should extract projectId from POST body', async () => {
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { id: 'u1' } });
    (cookies as ReturnType<typeof vi.fn>).mockResolvedValue({
      get: (name: string) => name === 'genilink-workspace' ? { value: 'ws1' } : undefined,
    });
    (verifyProjectInWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });
    (requireBilling as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const wrapped = withContentAuth(handler);
    const req = mockRequest('http://localhost/api/content', 'POST', { projectId: 'p1', title: 'test' });
    await wrapped(req);

    expect(handler).toHaveBeenCalledWith(
      { userId: 'u1', workspaceId: 'ws1', projectId: 'p1' },
      req,
    );
  });
});
