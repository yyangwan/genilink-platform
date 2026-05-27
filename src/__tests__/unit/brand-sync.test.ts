import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncBrandToVisibility, syncBrandDeleteToVisibility } from '@/lib/proxy/zhijian-client';
import { prisma } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  prisma: {
    projectBrand: {
      findMany: vi.fn(),
    },
    brand: {
      update: vi.fn(),
    },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const brand = {
  id: 'brand-1',
  name: 'Acme',
  aliases: ['ACME'],
  isCompetitor: false,
  workspaceId: 'ws-1',
};

const projectWithMapping = {
  id: 'proj-1',
  workspaceId: 'ws-1',
  externalMappings: [{ service: 'visibility', externalId: 'ext-10' }],
};

describe('Brand Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('syncBrandToVisibility', () => {
    it('creates remote brand in each project and returns remote IDs', async () => {
      (prisma.projectBrand.findMany as any).mockResolvedValue([
        { project: projectWithMapping },
      ]);
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 42 }),
      });

      const result = await syncBrandToVisibility(brand, null);

      expect(result.synced).toBe('full');
      expect(result.remoteIds).toEqual({ 'ext-10': '42' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/ext-10/brands'),
        expect.objectContaining({ method: 'POST' })
      );
      // Verify snake_case field sent to 智見
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.is_competitor).toBe(false);
    });

    it('updates existing remote brand when remoteId exists', async () => {
      (prisma.projectBrand.findMany as any).mockResolvedValue([
        { project: projectWithMapping },
      ]);
      mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });

      const existingRemoteIds = { 'ext-10': '42' };
      const result = await syncBrandToVisibility(brand, existingRemoteIds);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/ext-10/brands/42'),
        expect.objectContaining({ method: 'PATCH' })
      );
      expect(result.remoteIds).toEqual({ 'ext-10': '42' });
    });

    it('skips projects without visibility mapping', async () => {
      (prisma.projectBrand.findMany as any).mockResolvedValue([
        { project: { id: 'proj-2', workspaceId: 'ws-1', externalMappings: [] } },
      ]);

      const result = await syncBrandToVisibility(brand, null);

      expect(result.synced).toBe('full');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns partial when some syncs fail', async () => {
      const project2 = {
        id: 'proj-2',
        workspaceId: 'ws-1',
        externalMappings: [{ service: 'visibility', externalId: 'ext-20' }],
      };
      (prisma.projectBrand.findMany as any).mockResolvedValue([
        { project: projectWithMapping },
        { project: project2 },
      ]);

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 42 }) });
        return Promise.resolve({ ok: false, status: 500 });
      });

      const result = await syncBrandToVisibility(brand, null);

      expect(result.synced).toBe('partial');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('500');
    });

    it('retries on network failure then gives up', async () => {
      (prisma.projectBrand.findMany as any).mockResolvedValue([
        { project: projectWithMapping },
      ]);

      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await syncBrandToVisibility(brand, null);

      expect(result.synced).toBe('failed');
      expect(result.errors).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('syncBrandDeleteToVisibility', () => {
    it('deletes remote brands for all mapped projects', async () => {
      const remoteIds = { 'ext-10': '42', 'ext-20': '99' };
      mockFetch.mockResolvedValue({ ok: true });

      await syncBrandDeleteToVisibility(brand, remoteIds);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/ext-10/brands/42'),
        expect.objectContaining({ method: 'DELETE' })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/projects/ext-20/brands/99'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('does nothing when remoteIds is null', async () => {
      await syncBrandDeleteToVisibility(brand, null);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
