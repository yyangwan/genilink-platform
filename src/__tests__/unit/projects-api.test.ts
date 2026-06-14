/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/projects/route';
import { auth } from '@/lib/auth/config';
import { getWorkspaceId } from '@/lib/auth/get-workspace';
import { prisma } from '@/lib/db';
import { createBrandForProject } from '@/lib/brand-helpers';

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn(),
}));

vi.mock('@/lib/brand-helpers', () => ({
  createBrandForProject: vi.fn().mockResolvedValue(true),
}));

function mockRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWorkspaceId).mockResolvedValue('ws-1');
    (auth as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: 'user-1', email: 'user@example.com', name: 'User One' },
    });
    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'wm-1',
      userId: 'user-1',
      workspaceId: 'ws-1',
    });
    (prisma.project.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.project.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'proj-1',
      name: 'Alpha',
      url: 'https://alpha.example.com',
      industry: 'SaaS',
      productName: 'Alpha',
      productKeywords: ['ai'],
      productDescription: 'Alpha description',
      productUrl: 'https://product.example.com',
      workspaceId: 'ws-1',
    });
  });

  it('creates a project without auto-generating prompts', async () => {
    const req = mockRequest({
      name: 'Alpha',
      url: 'https://alpha.example.com',
      industry: 'SaaS',
      productName: 'Alpha',
      productKeywords: ['ai'],
      productDescription: 'Alpha description',
      productUrl: 'https://product.example.com',
      brandName: 'Alpha Brand',
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.project).toEqual(expect.objectContaining({ id: 'proj-1', name: 'Alpha' }));
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: {
        name: 'Alpha',
        url: 'https://alpha.example.com',
        industry: 'SaaS',
        productName: 'Alpha',
        productKeywords: ['ai'],
        productDescription: 'Alpha description',
        productUrl: 'https://product.example.com',
        workspaceId: 'ws-1',
      },
    });
    expect(createBrandForProject).toHaveBeenCalledWith('Alpha Brand', 'proj-1', 'ws-1');
  });
});
