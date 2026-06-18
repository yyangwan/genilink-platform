import { jwtVerify } from 'jose';

import { getPublicKey } from './keys';

const ISSUER = 'https://genilink.cn';
const DEFAULT_AUDIENCE = 'content.genilink.cn';

function extractBearerToken(input: unknown): string {
  if (typeof input === 'string') {
    return input.startsWith('Bearer ') ? input.slice(7).trim() : input.trim();
  }

  if (input && typeof input === 'object') {
    const candidate = input as {
      authorization?: unknown;
      headers?: { get?: (name: string) => string | null | undefined };
      token?: unknown;
    };

    if (typeof candidate.token === 'string') {
      return candidate.token.startsWith('Bearer ') ? candidate.token.slice(7).trim() : candidate.token.trim();
    }

    if (typeof candidate.authorization === 'string') {
      return candidate.authorization.startsWith('Bearer ')
        ? candidate.authorization.slice(7).trim()
        : candidate.authorization.trim();
    }

    const header = candidate.headers?.get?.('authorization');
    if (header) {
      return header.startsWith('Bearer ') ? header.slice(7).trim() : header.trim();
    }
  }

  return '';
}

export async function verifyBearerToken(input: unknown, audience: string = DEFAULT_AUDIENCE): Promise<Record<string, unknown>> {
  const token = extractBearerToken(input);
  if (!token) {
    throw new Error('Missing bearer token');
  }

  const publicKey = await getPublicKey();
  const { payload } = await jwtVerify(token, publicKey, {
    issuer: ISSUER,
    audience,
  });
  return payload as Record<string, unknown>;
}
