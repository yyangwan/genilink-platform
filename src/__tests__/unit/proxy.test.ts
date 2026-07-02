import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('proxy middleware', () => {
  const runProxy = proxy as unknown as (req: NextRequest) => Promise<Response> | Response;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete process.env.BILLING_DISABLED;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.BILLING_DISABLED;
  });

  it('allows compare routes in development even without an active subscription', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const req = new NextRequest('http://localhost/compare', {
      headers: {
        cookie: '__Secure-authjs.session-token=test-session; genilink-modules=content',
      },
    });

    const res = await runProxy(req);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows onboarding routes for an authenticated user', async () => {
    const req = new NextRequest('http://localhost/onboarding', {
      headers: { cookie: '__Secure-authjs.session-token=test-session' },
    });

    const res = await runProxy(req);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects onboarding routes to login when unauthenticated', async () => {
    const req = new NextRequest('http://localhost/onboarding');

    const res = await runProxy(req);
    const location = res.headers.get('location');

    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe('/auth/login');
    expect(new URL(location!).searchParams.get('callbackUrl')).toBe('/onboarding');
  });

  it('redirects legacy non-secure Auth.js cookies in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const req = new NextRequest('http://localhost/visibility', {
      headers: { cookie: 'authjs.session-token=legacy-session' },
    });

    const res = await runProxy(req);
    const location = res.headers.get('location');

    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe('/auth/login');
    expect(new URL(location!).searchParams.get('callbackUrl')).toBe('/visibility');
  });

  it('allows compare routes when billing is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.BILLING_DISABLED = 'true';

    const req = new NextRequest('http://localhost/compare', {
      headers: {
        cookie: '__Secure-authjs.session-token=test-session; genilink-modules=content',
      },
    });

    const res = await runProxy(req);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects compare routes to upgrade in production when visibility is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const req = new NextRequest('http://localhost/compare', {
      headers: {
        cookie: '__Secure-authjs.session-token=test-session; genilink-modules=content',
      },
    });

    const res = await runProxy(req);
    const location = res.headers.get('location');

    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe('/upgrade');
    expect(new URL(location!).searchParams.get('module')).toBe('visibility');
  });
});
