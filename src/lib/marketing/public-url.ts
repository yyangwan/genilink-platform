import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isBlockedIpAddress, normalizeProductWebsiteUrl } from '@/lib/product-website/url';

export async function assertPublicHttpUrl(value: unknown): Promise<{ url: string; hostname: string }> {
  const normalized = normalizeProductWebsiteUrl(value);
  if (!normalized.ok) throw new TypeError(normalized.error);

  const hostname = normalized.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => isBlockedIpAddress(address))) {
    throw new TypeError('Target URL is not allowed');
  }

  return normalized;
}
