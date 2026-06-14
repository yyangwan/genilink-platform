import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

import { getToken } from 'next-auth/jwt';
import { proxy } from '@/proxy';

describe('proxy middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV ?? 'test';
  const mockGetToken = vi.mocked(getToken);

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.BILLING_DISABLED;
    mockGetToken.mockResolvedValue({ sub: 'user-1' });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    delete process.env.BILLING_DISABLED;
  });

  it('allows compare routes in development even without an active subscription', async () => {
    process.env.NODE_ENV = 'development';

    const req = new NextRequest('http://localhost/compare', {
      headers: { cookie: 'genilink-modules=content' },
    });

    const res = await proxy(req);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows compare routes when billing is disabled', async () => {
    process.env.NODE_ENV = 'production';
    process.env.BILLING_DISABLED = 'true';

    const req = new NextRequest('http://localhost/compare', {
      headers: { cookie: 'genilink-modules=content' },
    });

    const res = await proxy(req);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects compare routes to upgrade in production when visibility is missing', async () => {
    process.env.NODE_ENV = 'production';

    const req = new NextRequest('http://localhost/compare', {
      headers: { cookie: 'genilink-modules=content' },
    });

    const res = await proxy(req);
    const location = res.headers.get('location');

    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe('/upgrade');
    expect(new URL(location!).searchParams.get('module')).toBe('visibility');
  });
});
