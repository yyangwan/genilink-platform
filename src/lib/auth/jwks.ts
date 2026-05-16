import { exportJWK } from 'jose';
import { getPublicKey } from './keys';

export async function getJWKS() {
  const publicKey = await getPublicKey();
  const jwk = await exportJWK(publicKey);
  return {
    keys: [
      {
        ...jwk,
        kid: 'genilink-v1',
        use: 'sig',
        alg: 'RS256',
      },
    ],
  };
}
