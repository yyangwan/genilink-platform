import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(), findUser: vi.fn(), updateUser: vi.fn(), createAudit: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@/lib/auth/ops', () => ({
  requireAdmin: mocks.requireAdmin,
  OpsAuthorizationError: class OpsAuthorizationError extends Error { constructor(public status: number) { super('FORBIDDEN'); } },
}));
vi.mock('@/lib/db', () => ({ prisma: {
  user: { findUnique: mocks.findUser },
  $transaction: mocks.transaction,
} }));

import { PATCH } from '@/app/api/ops/users/[id]/role/route';

describe('PATCH /api/ops/users/:id/role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: 'admin_1' });
    mocks.findUser.mockResolvedValue({ id: 'user_1', systemRole: 'user' });
    mocks.updateUser.mockResolvedValue({ id: 'user_1', systemRole: 'ops' });
    mocks.createAudit.mockResolvedValue({ id: 'audit_1' });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      user: { update: mocks.updateUser }, systemRoleAudit: { create: mocks.createAudit },
    }));
  });

  it('updates the role and records the actor and reason atomically', async () => {
    const request = new NextRequest('http://localhost/api/ops/users/user_1/role', {
      method: 'PATCH', body: JSON.stringify({ role: 'ops', reason: '负责销售线索' }),
    });
    const response = await PATCH(request, { params: Promise.resolve({ id: 'user_1' }) });
    expect(response.status).toBe(200);
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      targetUserId: 'user_1', actorUserId: 'admin_1', fromRole: 'user', toRole: 'ops', reason: '负责销售线索',
    }) });
  });
});
