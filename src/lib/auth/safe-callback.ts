const DEFAULT_CALLBACK = '/dashboard';
const MAX_CALLBACK_LENGTH = 2048;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function getSafeCallbackPath(
  candidate: string | null | undefined,
  origin: string,
  fallback = DEFAULT_CALLBACK,
): string {
  if (!candidate || candidate.length > MAX_CALLBACK_LENGTH) return fallback;
  if (CONTROL_CHARACTERS.test(candidate) || candidate.includes('\\')) return fallback;

  try {
    const base = new URL(origin);
    const target = new URL(candidate, base);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return fallback;
    if (target.origin !== base.origin) return fallback;
    if (target.username || target.password) return fallback;

    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export function buildLoginCallbackPath(pathname: string, search: string): string {
  const candidate = `${pathname}${search}`;
  if (candidate.length <= MAX_CALLBACK_LENGTH) return candidate;
  if (pathname.length <= MAX_CALLBACK_LENGTH) return pathname;
  return DEFAULT_CALLBACK;
}
