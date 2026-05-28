import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all deps BEFORE importing route handlers
vi.mock('@/lib/db', () => ({
  prisma: {
    brand: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    projectBrand: {
      count: vi.fn().mockResolvedValue(0),
    },
    project: {
      findMany: vi.fn().mockResolvedValue([]),
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
}));

vi.mock('@/lib/proxy/zhijian-client', () => ({
  syncBrandToVisibility: vi.fn().mockResolvedValue({
    synced: 'full',
    remoteIds: { 'ext-proj-1': 'remote-brand-1' },
    errors: [],
  }),
  syncBrandDeleteToVisibility: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'ws-1' }),
    set: vi.fn(),
  }),
}));

// Import after mocks are set up
import { GET, POST } from '@/app/api/brands/route';
import { GET as GetById, PATCH, DELETE } from '@/app/api/brands/[id]/route';
import { prisma } from '@/lib/db';

const mockBrand = {
  id: 'brand-1',
  name: 'Acme',
  aliases: ['ACME Corp'],
  isCompetitor: false,
  logo: null,
  website: null,
  description: null,
  remoteIds: { 'ext-proj-1': 'remote-brand-1' },
  workspaceId: 'ws-1',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeRequest(body?: unknown, method = 'GET') {
  return new Request('http://localhost/api/brands', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as any;
}

describe('Brand CRUD API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/brands', () => {
    it('returns workspace brands excluding soft-deleted', async () => {
      (prisma.brand.findMany as any).mockResolvedValue([mockBrand]);

      const res = await GET(makeRequest());
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe('Acme');
      expect(data[0].workspaceId).toBe('ws-1');
      expect(prisma.brand.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
    });

    it('returns empty array when no brands', async () => {
      (prisma.brand.findMany as any).mockResolvedValue([]);

      const res = await GET(makeRequest());
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual([]);
    });
  });

  describe('POST /api/brands', () => {
    it('creates a brand and triggers sync', async () => {
      (prisma.brand.create as any).mockResolvedValue(mockBrand);
      (prisma.brand.update as any).mockResolvedValue({
        ...mockBrand,
        remoteIds: { 'ext-proj-1': 'remote-brand-1' },
      });
      // Simulate brand has project associations so sync is triggered
      (prisma.projectBrand.count as any).mockResolvedValueOnce(1);

      const res = await POST(
        makeRequest({ name: 'Acme', aliases: ['ACME Corp'], isCompetitor: false }, 'POST')
      );
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.name).toBe('Acme');
      expect(prisma.brand.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Acme',
          aliases: ['ACME Corp'],
          isCompetitor: false,
          workspaceId: 'ws-1',
        }),
      });
    });

    it('returns 207 when sync partially fails', async () => {
      (prisma.brand.create as any).mockResolvedValue(mockBrand);
      // Brand has associations so sync path is taken
      (prisma.projectBrand.count as any).mockResolvedValueOnce(1);

      const { syncBrandToVisibility } = await import('@/lib/proxy/zhijian-client');
      (syncBrandToVisibility as any).mockResolvedValueOnce({
        synced: 'partial',
        remoteIds: { 'ext-proj-1': 'remote-brand-1' },
        errors: ['timeout'],
      });

      const res = await POST(
        makeRequest({ name: 'Acme' }, 'POST')
      );

      expect(res.status).toBe(207);
    });

    it('returns 400 for empty name', async () => {
      const res = await POST(
        makeRequest({ name: '  ' }, 'POST')
      );

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('不能为空');
    });

    it('returns 409 for duplicate active name', async () => {
      const error = new Error('Unique constraint') as any;
      error.code = 'P2002';
      (prisma.brand.create as any).mockRejectedValue(error);

      const res = await POST(
        makeRequest({ name: 'Acme' }, 'POST')
      );

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('已存在');
    });
  });

  describe('GET /api/brands/[id]', () => {
    it('returns brand by id', async () => {
      (prisma.brand.findFirst as any).mockResolvedValue(mockBrand);

      const res = await GetById(makeRequest(), { params: Promise.resolve({ id: 'brand-1' }) });
      expect(res.status).toBe(200);
    });

    it('returns 404 for missing brand', async () => {
      (prisma.brand.findFirst as any).mockResolvedValue(null);

      const res = await GetById(makeRequest(), { params: Promise.resolve({ id: 'brand-999' }) });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/brands/[id]', () => {
    it('updates brand and syncs', async () => {
      (prisma.brand.findFirst as any).mockResolvedValue(mockBrand);
      const updated = { ...mockBrand, name: 'Acme Updated' };
      (prisma.brand.update as any).mockResolvedValue(updated);

      const res = await PATCH(
        makeRequest({ name: 'Acme Updated' }, 'PATCH'),
        { params: Promise.resolve({ id: 'brand-1' }) }
      );

      expect(res.status).toBe(200);
      expect(prisma.brand.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'brand-1' },
          data: expect.objectContaining({ name: 'Acme Updated' }),
        })
      );
    });

    it('returns 404 for missing brand', async () => {
      (prisma.brand.findFirst as any).mockResolvedValue(null);

      const res = await PATCH(
        makeRequest({ name: 'X' }, 'PATCH'),
        { params: Promise.resolve({ id: 'brand-999' }) }
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/brands/[id]', () => {
    it('soft deletes brand', async () => {
      (prisma.brand.findFirst as any).mockResolvedValue(mockBrand);
      (prisma.brand.update as any).mockResolvedValue({
        ...mockBrand,
        deletedAt: new Date(),
      });

      const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'brand-1' }) });

      expect(res.status).toBe(200);
      expect(prisma.brand.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'brand-1' },
          data: { deletedAt: expect.any(Date) },
        })
      );
    });

    it('returns 404 for missing brand', async () => {
      (prisma.brand.findFirst as any).mockResolvedValue(null);

      const res = await DELETE(makeRequest(), { params: Promise.resolve({ id: 'brand-999' }) });

      expect(res.status).toBe(404);
    });
  });
});
