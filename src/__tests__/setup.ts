import { vi } from 'vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Mock NextAuth
vi.mock('@/lib/auth/config', () => ({
  auth: vi.fn((handler?: unknown) => {
    const defaultSession = {
      user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' },
    };
    const resolveSession = () => {
      const mockSession = (globalThis as { __mockAuthSession?: unknown }).__mockAuthSession;
      return mockSession === undefined ? defaultSession : mockSession;
    };

    if (typeof handler === 'function') {
      return async (req: unknown, ctx: unknown) =>
        (handler as (req: unknown, ctx: unknown) => unknown)(
          Object.assign(req as object, { auth: resolveSession() }),
          ctx,
        );
    }

    return Promise.resolve(resolveSession());
  }),
  handlers: { GET: vi.fn(), POST: vi.fn() },
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    wechatLoginSession: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    billingPlan: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    paymentOrder: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    paymentEvent: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    workspaceMember: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    workspace: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn()),
  },
}));
