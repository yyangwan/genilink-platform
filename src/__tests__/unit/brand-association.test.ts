import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all deps
vi.mock('@/lib/db', () => ({
  prisma: {
    projectBrand: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    project: {
      findFirst: vi.fn().mockResolvedValue({ id: 'proj-1', workspaceId: 'ws-1' }),
    },
    brand: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    externalResourceMapping: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/auth/get-workspace', () => ({
  getWorkspaceId: vi.fn().mockResolvedValue('ws-1'),
}));

vi.mock('@/lib/auth/workspace', () => ({
  validateWorkspaceAccess: vi.fn().mockResolvedValue(true),
  verifyProjectInWorkspace: vi.fn().mockResolvedValue({ id: 'proj-1' }),
}));

vi.mock('@/lib/proxy/zhijian-client', () => ({
  syncBrandToProject: vi.fn().mockResolvedValue({ remoteId: 'remote-1', remoteIds: { 'ext-1': 'remote-1' } }),
  syncBrandDisassociate: vi.fn().mockResolvedValue({ remoteIds: {} }),
}));

import { GET, POST, DELETE } from '@/app/api/projects/[id]/brands/route';
import { GET as GET_bp, DELETE as DELETE_bp } from '@/app/api/brands/[id]/projects/route';
import { prisma } from '@/lib/db';
import { syncBrandToProject, syncBrandDisassociate } from '@/lib/proxy/zhijian-client';

const mockBrand = {
  id: 'brand-1',
  name: 'Acme',
  aliases: [],
  isCompetitor: false,
  remoteIds: { 'ext-1': 'remote-1' },
  workspaceId: 'ws-1',
  deletedAt: null,
};

const mockProject = {
  id: 'proj-1',
  name: 'Project 1',
  workspaceId: 'ws-1',
};

function makeRequest(body?: unknown, method = 'GET') {
  return new Request('http://localhost/api/test', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

// ─── /api/projects/[id]/brands ───

describe('GET /api/projects/[id]/brands', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns associated brands excluding soft-deleted', async () => {
    (prisma.projectBrand.findMany as any).mockResolvedValue([
      { brand: mockBrand },
      { brand: { ...mockBrand, id: 'brand-2', deletedAt: new Date() } },
    ]);

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'proj-1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.brands).toHaveLength(1);
    expect(data.brands[0].id).toBe('brand-1');
  });

  it('returns 404 for project not in workspace', async () => {
    const { getWorkspaceId } = await import('@/lib/auth/get-workspace');
    (getWorkspaceId as any).mockResolvedValueOnce(null);

    const res = await GET(makeRequest(), { params: Promise.resolve({ id: 'proj-999' }) });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/projects/[id]/brands', () => {
  beforeEach(() => vi.clearAllMocks());

  it('associates a brand and syncs to 智見', async () => {
    (prisma.brand.findFirst as any).mockResolvedValue(mockBrand);
    (prisma.projectBrand.create as any).mockResolvedValue({});

    const res = await POST(
      makeRequest({ brandId: 'brand-1' }, 'POST'),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(201);
    expect(syncBrandToProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'brand-1' }),
      'proj-1',
      expect.any(Object),
    );
  });

  it('returns 409 for duplicate association', async () => {
    (prisma.brand.findFirst as any).mockResolvedValue(mockBrand);
    const err = new Error('Unique') as any;
    err.code = 'P2002';
    (prisma.projectBrand.create as any).mockRejectedValue(err);

    const res = await POST(
      makeRequest({ brandId: 'brand-1' }, 'POST'),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(409);
  });

  it('returns 404 for brand not in workspace', async () => {
    (prisma.brand.findFirst as any).mockResolvedValue(null);

    const res = await POST(
      makeRequest({ brandId: 'brand-999' }, 'POST'),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(404);
  });

  it('returns 400 when brandId missing', async () => {
    const res = await POST(
      makeRequest({}, 'POST'),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/projects/[id]/brands', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disassociates a brand and syncs', async () => {
    (prisma.projectBrand.deleteMany as any).mockResolvedValue({ count: 1 });
    (prisma.brand.findUnique as any).mockResolvedValue(mockBrand);
    (syncBrandDisassociate as any).mockResolvedValue({ remoteIds: {} });

    const res = await DELETE(
      makeRequest({ brandId: 'brand-1' }, 'DELETE'),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(200);
    expect(syncBrandDisassociate).toHaveBeenCalled();
  });

  it('returns 404 for non-existent association', async () => {
    (prisma.projectBrand.deleteMany as any).mockResolvedValue({ count: 0 });

    const res = await DELETE(
      makeRequest({ brandId: 'brand-1' }, 'DELETE'),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(404);
  });
});

// ─── /api/brands/[id]/projects ───

describe('GET /api/brands/[id]/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // verifyBrandAccess needs brand.findFirst to return a brand
    (prisma.brand.findFirst as any).mockResolvedValue(mockBrand);
  });

  it('returns projects for a brand', async () => {
    (prisma.projectBrand.findMany as any).mockResolvedValue([
      { project: mockProject },
    ]);

    const res = await GET_bp(makeRequest(), { params: Promise.resolve({ id: 'brand-1' }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.projects).toHaveLength(1);
  });

  it('returns 404 for brand not found', async () => {
    const { getWorkspaceId } = await import('@/lib/auth/get-workspace');
    (getWorkspaceId as any).mockResolvedValueOnce(null);

    const res = await GET_bp(makeRequest(), { params: Promise.resolve({ id: 'brand-999' }) });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/brands/[id]/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.brand.findFirst as any).mockResolvedValue(mockBrand);
  });

  it('disassociates brand from project', async () => {
    (prisma.projectBrand.deleteMany as any).mockResolvedValue({ count: 1 });
    (prisma.brand.findUnique as any).mockResolvedValue(mockBrand);
    (syncBrandDisassociate as any).mockResolvedValue({ remoteIds: {} });

    const res = await DELETE_bp(
      makeRequest({ projectId: 'proj-1' }, 'DELETE'),
      { params: Promise.resolve({ id: 'brand-1' }) },
    );

    expect(res.status).toBe(200);
  });

  it('returns 400 when projectId missing', async () => {
    const res = await DELETE_bp(
      makeRequest({ brandId: 'brand-1' }, 'DELETE'),
      { params: Promise.resolve({ id: 'brand-1' }) },
    );

    expect(res.status).toBe(400);
  });
});
