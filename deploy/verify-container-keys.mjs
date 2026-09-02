import fs from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { importPKCS8, importSPKI } from 'jose';

const privatePem = fs.readFileSync('/app/.keys/private.pem', 'utf8');
const publicPem = fs.readFileSync('/app/.keys/public.pem', 'utf8');

await importPKCS8(privatePem, 'RS256');
await importSPKI(publicPem, 'RS256');

const derivedPublic = createPublicKey(createPrivateKey(privatePem)).export({
  type: 'spki',
  format: 'pem',
});
const mountedPublic = createPublicKey(publicPem).export({
  type: 'spki',
  format: 'pem',
});

if (derivedPublic !== mountedPublic) {
  throw new Error('mounted private and public signing keys do not match');
}
