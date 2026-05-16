import { getJWKS } from '@/lib/auth/jwks';
import { NextResponse } from 'next/server';

export async function GET() {
  const jwks = await getJWKS();
  return NextResponse.json(jwks, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
