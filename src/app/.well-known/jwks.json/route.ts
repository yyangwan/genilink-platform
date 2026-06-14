import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';

/** JWKS endpoint for local development — serves the public key used for RS256 JWT signing. */
export async function GET() {
  try {
    const pemPath = join(process.cwd(), '.keys', 'public.pem');
    const pem = await readFile(pemPath, 'utf-8');
    const key = crypto.createPublicKey(pem);
    const exportObj = key.export({ format: 'jwk' });

    const jwks = {
      keys: [
        {
          kty: 'RSA',
          kid: 'genilink-v1',
          alg: 'RS256',
          use: 'sig',
          n: exportObj.n,
          e: exportObj.e,
        },
      ],
    };

    return NextResponse.json(jwks);
  } catch {
    return NextResponse.json(
      { error: 'JWKS not available' },
      { status: 503 }
    );
  }
}
