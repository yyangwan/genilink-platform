import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication but no specific module
const BASE_ROUTES = ['/dashboard', '/projects', '/settings', '/onboarding', '/upgrade'];

// Routes that require 'visibility' module subscription
const VISIBILITY_ROUTES = ['/visibility', '/audits', '/schedules', '/suggestions', '/trends', '/compare'];

// Routes that require 'content' module subscription
const CONTENT_ROUTES = ['/content'];

function requiresModule(pathname: string): string | null {
  if (BASE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))) return null;
  if (VISIBILITY_ROUTES.some((r) => pathname.startsWith(r))) return 'visibility';
  if (CONTENT_ROUTES.some((r) => pathname.startsWith(r))) return 'content';
  return null;
}

function hasSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get('__Secure-authjs.session-token')?.value ||
      request.cookies.get('authjs.session-token')?.value ||
      request.cookies.get('__Host-authjs.session-token')?.value,
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-dashboard routes
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check authentication via the Auth.js session cookie
  if (!hasSessionCookie(request)) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check module access
  const requiredModule = requiresModule(pathname);

  // null = base route or unknown, always allowed
  if (requiredModule === null) {
    return NextResponse.next();
  }

  // Development mode and explicit billing disable both bypass subscription gating.
  if (process.env.NODE_ENV === 'development' || process.env.BILLING_DISABLED === 'true') {
    return NextResponse.next();
  }

  // Check genilink-modules cookie for module subscription
  const modulesCookie = request.cookies.get('genilink-modules')?.value ?? '';

  // If cookie not set yet (first visit after login), allow through.
  // Cookie gets set when user switches workspace via /api/workspaces/switch.
  // Page-level and API-level billing checks still enforce access.
  if (!modulesCookie) {
    return NextResponse.next();
  }

  const activeModules = modulesCookie.split(',').filter(Boolean);

  if (!activeModules.includes(requiredModule)) {
    const upgradeUrl = new URL('/upgrade', request.url);
    upgradeUrl.searchParams.set('module', requiredModule);
    return NextResponse.redirect(upgradeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - auth (auth pages)
     * - favicon.ico
     */
    '/((?!api|_next/static|_next/image|auth|favicon\\.ico).*)',
  ],
};
