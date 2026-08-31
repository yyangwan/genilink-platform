import { beforeEach, describe, expect, it, vi } from 'vitest';

const bcrypt = vi.hoisted(() => ({ compare: vi.fn() }));
vi.mock('bcryptjs', () => ({ default: bcrypt }));

import { normalizeEmail, validatePassword, verifyEmailPassword } from '@/lib/auth/email-password';
import { prisma } from '@/lib/db';

describe('email password authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret');
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ count: 1 }]);
  });

  it('normalizes valid email addresses and rejects invalid values', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });

  it('enforces the password length accepted by bcrypt', () => {
    expect(validatePassword('12345678')).toBe('12345678');
    expect(validatePassword('1234567')).toBeNull();
    expect(validatePassword('密'.repeat(25))).toBeNull();
  });

  it('returns an existing user only when the password matches', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: null,
      loginEmail: 'user@example.com',
      name: '测试用户',
      passwordHash: 'stored-hash',
    } as never);
    bcrypt.compare.mockResolvedValue(true);

    await expect(verifyEmailPassword('USER@example.com', 'password123')).resolves.toEqual({
      id: 'user-1',
      email: null,
      name: '测试用户',
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { loginEmail: 'user@example.com' },
    }));
  });

  it('does not create an account when credentials do not match', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await expect(verifyEmailPassword('missing@example.com', 'password123')).resolves.toBeNull();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects passwords longer than bcrypt can safely compare', async () => {
    await expect(verifyEmailPassword('user@example.com', `${'a'.repeat(72)}b`)).resolves.toBeNull();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('stops password checks after the shared account limit is reached', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce([{ count: 11 }]);

    await expect(verifyEmailPassword('user@example.com', 'password123', '203.0.113.1')).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('does not create an account bucket after the IP limit is reached', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count: 31 }]);

    await expect(verifyEmailPassword('random@example.com', 'password123', '203.0.113.1')).resolves.toBeNull();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('reclaims a bounded batch of expired buckets when an IP window starts', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ count: 1 }]);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    await verifyEmailPassword('missing@example.com', 'password123', '203.0.113.2');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
