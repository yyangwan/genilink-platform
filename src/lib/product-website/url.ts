import { isIP } from 'node:net';

export type NormalizedProductWebsiteUrl =
  | { ok: true; url: string; hostname: string }
  | { ok: false; error: string };

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
]);

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a === 0
  );
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) return isPrivateIpv4(normalized);
  if (ipVersion === 6) {
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    );
  }

  return false;
}

export function normalizeProductWebsiteUrl(value: unknown): NormalizedProductWebsiteUrl {
  if (typeof value !== 'string') {
    return { ok: false, error: 'Missing target URL' };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: 'Missing target URL' };
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return { ok: false, error: 'Invalid target URL' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https URLs are supported' };
  }

  if (!parsed.hostname || isBlockedHostname(parsed.hostname)) {
    return { ok: false, error: 'Target URL is not allowed' };
  }

  parsed.hash = '';
  return {
    ok: true,
    url: parsed.toString(),
    hostname: parsed.hostname,
  };
}
