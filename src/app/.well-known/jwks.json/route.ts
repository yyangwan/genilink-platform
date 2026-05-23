import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createPublicKey } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  const publicKeyPem = readFileSync(join(process.cwd(), '.keys', 'public.pem'), 'utf-8');
  const publicKey = createPublicKey(publicKeyPem);
  const jwk = publicKey.export({ format: 'jwk' });

  return NextResponse.json({
    keys: [
      {
        ...jwk,
        kid: 'genilink-v1',
        use: 'sig',
        alg: 'RS256',
      },
    ],
  });
}
