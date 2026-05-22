import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    workspaceMember: {
      findFirst: vi.fn(),
    },
  },
}));

import { requirePermission, PermissionDeniedError } from '@/lib/auth/content-permissions';
import { prisma } from '@/lib/db';

describe('content-permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requirePermission', () => {
    it('returns "owner" when owner requests delete', async () => {
      (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'owner',
      });

      const role = await requirePermission('u1', 'ws1', 'delete');
      expect(role).toBe('owner');
    });

    it('returns "admin" when admin requests delete', async () => {
      (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'admin',
      });

      const role = await requirePermission('u1', 'ws1', 'delete');
      expect(role).toBe('admin');
    });

    it('returns "member" when member requests read', async () => {
      (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'member',
      });

      const role = await requirePermission('u1', 'ws1', 'read');
      expect(role).toBe('member');
    });

    it('returns "member" when member requests write', async () => {
      (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'member',
      });

      const role = await requirePermission('u1', 'ws1', 'write');
      expect(role).toBe('member');
    });

    it('throws PermissionDeniedError when member requests delete', async () => {
      (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'member',
      });

      await expect(requirePermission('u1', 'ws1', 'delete')).rejects.toThrow(PermissionDeniedError);
      await expect(requirePermission('u1', 'ws1', 'delete')).rejects.toMatchObject({
        action: 'delete',
        role: 'member',
      });
    });

    it('throws PermissionDeniedError when user has no membership', async () => {
      (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(requirePermission('u1', 'ws1', 'read')).rejects.toThrow(PermissionDeniedError);
      await expect(requirePermission('u1', 'ws1', 'read')).rejects.toMatchObject({
        action: 'read',
        role: 'none',
      });
    });

    it('throws PermissionDeniedError when role is unknown', async () => {
      (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'guest',
      });

      await expect(requirePermission('u1', 'ws1', 'read')).rejects.toThrow(PermissionDeniedError);
      await expect(requirePermission('u1', 'ws1', 'read')).rejects.toMatchObject({
        action: 'read',
        role: 'guest',
      });
    });

    it('queries with correct userId and workspaceId', async () => {
      (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'owner',
      });

      await requirePermission('user-abc', 'ws-xyz', 'read');

      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-abc', workspaceId: 'ws-xyz' },
        select: { role: true },
      });
    });
  });

  describe('PermissionDeniedError', () => {
    it('has correct properties', () => {
      const err = new PermissionDeniedError('delete', 'member');

      expect(err.name).toBe('PermissionDeniedError');
      expect(err.message).toBe("Role 'member' cannot perform action 'delete'");
      expect(err.action).toBe('delete');
      expect(err.role).toBe('member');
    });

    it('is an instance of Error', () => {
      const err = new PermissionDeniedError('read', 'none');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(PermissionDeniedError);
    });
  });
});
