// Idempotency helpers (spec §8): stable JSON serialization + SHA-256 request hash.
// Same key + same body -> replay first result; same key + different body -> 409.

import crypto from 'crypto';

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

export function requestHash(body: unknown): string {
  return sha256(stableStringify(body));
}

export function getIdempotencyKey(req: Request): string | null {
  const value = req.headers.get('idempotency-key')?.trim();
  return value ? value : null;
}

export type IdempotencyResolution =
  | { type: 'new' }
  | { type: 'replay' }
  | { type: 'conflict' };

export function resolveIdempotency(params: {
  existingKey: string | null | undefined;
  existingHash: string | null | undefined;
  key: string;
  hash: string;
}): IdempotencyResolution {
  if (!params.existingKey) return { type: 'new' };
  if (params.existingKey !== params.key) return { type: 'conflict' };
  if (params.existingHash === params.hash) return { type: 'replay' };
  return { type: 'conflict' };
}

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002',
  );
}
