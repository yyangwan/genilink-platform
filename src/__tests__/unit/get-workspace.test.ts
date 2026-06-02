import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieStore, validateWorkspaceAccessMock } = vi.hoisted(() => ({
  cookieStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
  validateWorkspaceAccessMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(cookieStore),
}));

vi.mock('@/lib/auth/workspace', () => ({
  validateWorkspaceAccess: validateWorkspaceAccessMock,
}));

import { prisma } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth/get-workspace';

describe('getWorkspaceId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.get.mockReset();
    cookieStore.set.mockReset();
  });

  it('returns the cookie workspace when the user is a member', async () => {
    cookieStore.get.mockReturnValue({ value: 'ws-cookie' });
    validateWorkspaceAccessMock.mockResolvedValue(true);

    const workspaceId = await getWorkspaceId('user-1');

    expect(workspaceId).toBe('ws-cookie');
    expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it('falls back to the first membership when the cookie workspace is invalid', async () => {
    cookieStore.get.mockReturnValue({ value: 'ws-stale' });
    validateWorkspaceAccessMock.mockResolvedValue(false);
    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      workspaceId: 'ws-fallback',
    });

    const workspaceId = await getWorkspaceId('user-1');

    expect(workspaceId).toBe('ws-fallback');
    expect(cookieStore.set).toHaveBeenCalledWith(
      'genilink-workspace',
      'ws-fallback',
      expect.objectContaining({
        path: '/',
        sameSite: 'lax',
      }),
    );
  });

  it('returns null when the user has no workspace memberships', async () => {
    cookieStore.get.mockReturnValue(undefined);
    validateWorkspaceAccessMock.mockResolvedValue(false);
    (prisma.workspaceMember.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const workspaceId = await getWorkspaceId('user-1');

    expect(workspaceId).toBeNull();
  });
});
