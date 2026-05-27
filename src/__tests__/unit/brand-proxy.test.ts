import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncBrandToVisibility } from '@/lib/proxy/zhijian-client';
import { prisma } from '@/lib/db';

/**
 * Tests for the camelCase → snake_case field transform at the sync boundary.
 * 智链 uses camelCase (isCompetitor), 智見 uses snake_case (is_competitor).
 * The sync function must transform fields when pushing to 智見.
 */
vi.mock('@/lib/db', () => ({
  prisma: {
    projectBrand: {
      findMany: vi.fn(),
    },
  },
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const projectWithMapping = {
  id: 'proj-1',
  workspaceId: 'ws-1',
  externalMappings: [{ service: 'visibility', externalId: 'ext-10' }],
};

describe('Brand Proxy Field Transform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.projectBrand.findMany as any).mockResolvedValue([
      { project: projectWithMapping },
    ]);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 42 }),
    });
  });

  it('transforms isCompetitor → is_competitor when syncing to 智見', async () => {
    const brand = {
      id: 'b-1',
      name: 'Acme',
      aliases: ['A'],
      isCompetitor: true,
      workspaceId: 'ws-1',
    };

    await syncBrandToVisibility(brand, null);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.is_competitor).toBe(true);
    expect(body.isCompetitor).toBeUndefined();
  });

  it('passes aliases array unchanged', async () => {
    const brand = {
      id: 'b-1',
      name: 'Acme',
      aliases: ['ACME Corp', 'ACME Inc'],
      isCompetitor: false,
      workspaceId: 'ws-1',
    };

    await syncBrandToVisibility(brand, null);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.aliases).toEqual(['ACME Corp', 'ACME Inc']);
  });

  it('sends name as-is (no transform needed)', async () => {
    const brand = {
      id: 'b-1',
      name: 'My Brand',
      aliases: [],
      isCompetitor: false,
      workspaceId: 'ws-1',
    };

    await syncBrandToVisibility(brand, null);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.name).toBe('My Brand');
  });

  it('does not send logo/website/description to 智見 (only core fields)', async () => {
    const brand = {
      id: 'b-1',
      name: 'Acme',
      aliases: [],
      isCompetitor: false,
      logo: 'https://logo.png',
      website: 'https://acme.com',
      description: 'A company',
      workspaceId: 'ws-1',
    };

    await syncBrandToVisibility(brand, null);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // Core fields present
    expect(body.name).toBe('Acme');
    expect(body.is_competitor).toBe(false);
    // Extended fields not sent to 智見 (only core schema synced)
    expect(body.logo).toBeUndefined();
    expect(body.website).toBeUndefined();
    expect(body.description).toBeUndefined();
  });
});
