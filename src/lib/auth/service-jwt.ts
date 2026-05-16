import { SignJWT } from 'jose';
import { getPrivateKey } from './keys';

const ISSUER = 'https://app.genilink.cn';
const TOKEN_TTL = '5m';

export async function issueServiceJWT(params: {
  userId: string;
  email?: string | null;
  name?: string | null;
  workspaceId?: string | null;
  audience: string;
}): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({
    sub: params.userId,
    email: params.email ?? undefined,
    name: params.name ?? undefined,
    wid: params.workspaceId ?? undefined,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'genilink-v1' })
    .setIssuer(ISSUER)
    .setAudience(params.audience)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(privateKey);
}
