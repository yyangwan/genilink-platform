import fs from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';

const privatePem = fs.readFileSync('/app/.keys/private.pem', 'utf8');
const publicPem = fs.readFileSync('/app/.keys/public.pem', 'utf8');

const derivedPublic = createPublicKey(createPrivateKey(privatePem)).export({
  type: 'spki',
  format: 'der',
});
const mountedPublic = createPublicKey(publicPem).export({
  type: 'spki',
  format: 'der',
});

if (!derivedPublic.equals(mountedPublic)) {
  throw new Error('mounted private and public signing keys do not match');
}
