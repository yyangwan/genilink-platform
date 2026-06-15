import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';

describe('proxy middleware', () => {
  const runProxy = proxy as unknown as (req: NextRequest) => Promise<Response> | Response;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    delete process.env.BILLING_DISABLED;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/auth/session')) {
        return new Response(JSON.stringify({ user: { id: 'user-1', email: 'test@example.com', name: 'Test User' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.BILLING_DISABLED;
    vi.unstubAllGlobals();
  });

  it('allows compare routes in development even without an active subscription', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    const req = new NextRequest('http://localhost/compare', {
      headers: { cookie: 'genilink-modules=content' },
    });

    const res = await runProxy(req);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('allows onboarding routes for an authenticated user', async () => {
    const req = new NextRequest('http://localhost/onboarding');

    const res = await runProxy(req);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects onboarding routes to login when unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/auth/session')) {
        return new Response('null', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('not found', { status: 404 });
    }));

    const req = new NextRequest('http://localhost/onboarding');

    const res = await runProxy(req);
    const location = res.headers.get('location');

    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe('/auth/login');
    expect(new URL(location!).searchParams.get('callbackUrl')).toBe('/onboarding');
  });

  it('allows compare routes when billing is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.BILLING_DISABLED = 'true';

    const req = new NextRequest('http://localhost/compare', {
      headers: { cookie: 'genilink-modules=content' },
    });

    const res = await runProxy(req);

    expect(res.headers.get('x-middleware-next')).toBe('1');
    expect(res.headers.get('location')).toBeNull();
  });

  it('redirects compare routes to upgrade in production when visibility is missing', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    const req = new NextRequest('http://localhost/compare', {
      headers: { cookie: 'genilink-modules=content' },
    });

    const res = await runProxy(req);
    const location = res.headers.get('location');

    expect(location).toBeTruthy();
    expect(new URL(location!).pathname).toBe('/upgrade');
    expect(new URL(location!).searchParams.get('module')).toBe('visibility');
  });
});
