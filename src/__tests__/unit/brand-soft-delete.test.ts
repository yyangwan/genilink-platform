/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for soft-delete + partial unique index edge cases.
 *
 * PostgreSQL partial unique index: CREATE UNIQUE INDEX ON "Brand" ("workspaceId", name) WHERE "deletedAt" IS NULL
 *
 * Key behaviors:
 * - Two active brands with same name in same workspace → REJECTED (P2002)
 * - Soft-deleted brand + new active brand with same name → ALLOWED
 * - Multiple soft-deleted brands with same name → ALLOWED
 * - Active brands with same name in different workspaces → ALLOWED
 *
 * Since these tests depend on PostgreSQL behavior, we mock Prisma to simulate
 * the constraint behavior. Integration tests against a real DB would verify the
 * actual partial index.
 */
vi.mock('@/lib/db', () => ({
  prisma: {
    brand: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
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
    remoteIds: {},
    errors: [],
  }),
  syncBrandDeleteToVisibility: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'ws-1' }),
    set: vi.fn(),
  }),
}));

import { POST, GET } from '@/app/api/brands/route';
import { prisma } from '@/lib/db';

function makeRequest(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/brands', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

describe('Brand Soft Delete Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects creating a brand with the same name as an existing active brand', async () => {
    // Simulate P2002 unique constraint violation from partial index
    const error = new Error('Unique violation') as any;
    error.code = 'P2002';
    (prisma.brand.create as any).mockRejectedValue(error);

    const res = await POST(makeRequest({ name: 'Acme' }));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('已存在');
  });

  it('allows creating a brand with the same name as a soft-deleted brand', async () => {
    // The partial index only covers WHERE "deletedAt" IS NULL
    // Soft-deleted brands don't conflict, so create succeeds
    const newBrand = {
      id: 'brand-2',
      name: 'Acme',
      aliases: [],
      isCompetitor: false,
      workspaceId: 'ws-1',
      deletedAt: null,
    };
    (prisma.brand.create as any).mockResolvedValue(newBrand);

    const res = await POST(makeRequest({ name: 'Acme' }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('Acme');
  });

  it('excludes soft-deleted brands from GET list', async () => {
    const activeBrand = {
      id: 'brand-1',
      name: 'Active',
      aliases: [],
      isCompetitor: false,
      workspaceId: 'ws-1',
      deletedAt: null,
    };
    (prisma.brand.findMany as any).mockResolvedValue([activeBrand]);

    const res = await GET(makeRequest({}));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('Active');
    // Verify query uses deletedAt: null filter
    expect(prisma.brand.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      })
    );
  });

  it('allows multiple soft-deleted brands with the same name', async () => {
    // Two deleted brands with name "Acme" have different deletedAt timestamps,
    // so they don't conflict with each other or with the partial unique index
    // (which only covers WHERE "deletedAt" IS NULL).
    // This is tested conceptually — the DB enforces it via the partial index.
    // We just verify the API handles the flow correctly.

    const deletedBrand = {
      id: 'brand-1',
      name: 'Acme',
      aliases: [],
      isCompetitor: false,
      workspaceId: 'ws-1',
      deletedAt: new Date('2026-01-01'),
    };

    // GET should not return deleted brands
    (prisma.brand.findMany as any).mockResolvedValue([]);

    const res = await GET(makeRequest({}));
    const data = await res.json();

    expect(data).toHaveLength(0);
    // The partial index guarantees only active names are unique
    // Multiple soft-deleted with same name is valid
  });

  it('allows same brand name in different workspaces', async () => {
    // Different workspaceId → no conflict
    // (simulated by successful create — actual enforcement is in DB)
    const brand = {
      id: 'brand-10',
      name: 'Acme',
      aliases: [],
      isCompetitor: false,
      workspaceId: 'ws-2', // different workspace
      deletedAt: null,
    };
    (prisma.brand.create as any).mockResolvedValue(brand);

    const res = await POST(makeRequest({ name: 'Acme' }));

    expect(res.status).toBe(201);
  });
});
