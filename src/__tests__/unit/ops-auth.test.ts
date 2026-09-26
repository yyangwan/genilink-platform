import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUser: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/config', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));

import { OpsAuthorizationError, requireAdmin, requireOps } from '@/lib/auth/ops';

describe('operations authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.auth.mockResolvedValue({ user: { id: 'user_1' } });
  });

  it('denies a normal user', async () => {
    mocks.findUser.mockResolvedValue({ id: 'user_1', systemRole: 'user' });
    await expect(requireOps()).rejects.toEqual(expect.objectContaining<Partial<OpsAuthorizationError>>({ status: 403 }));
  });

  it('allows an operations user', async () => {
    mocks.findUser.mockResolvedValue({ id: 'user_1', systemRole: 'ops' });
    await expect(requireOps()).resolves.toMatchObject({ id: 'user_1', systemRole: 'ops' });
  });

  it('treats an environment bootstrap user as admin', async () => {
    vi.stubEnv('OPS_USER_IDS', 'other,user_1');
    mocks.findUser.mockResolvedValue({ id: 'user_1', systemRole: 'user' });
    await expect(requireAdmin()).resolves.toMatchObject({ id: 'user_1', systemRole: 'admin' });
  });
});
