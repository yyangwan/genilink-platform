import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

type Contact = { phone?: string; email?: string; wechat?: string };
type Envelope = { v: 1; kid: string; alg: 'A256GCM'; iv: string; tag: string; ciphertext: string };
const AAD = Buffer.from('genilink:marketing-contact:v1');

function encryptionKey(): Buffer {
  const encoded = process.env.MARKETING_CONTACT_ENCRYPTION_KEY;
  if (!encoded) throw new Error('MARKETING_CONTACT_ENCRYPTION_KEY is required');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('MARKETING_CONTACT_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

function hmacKey(): string {
  const key = process.env.MARKETING_CONTACT_HMAC_SECRET || process.env.MARKETING_HMAC_SECRET;
  if (!key) throw new Error('MARKETING_CONTACT_HMAC_SECRET or MARKETING_HMAC_SECRET is required');
  return key;
}

export function normalizeContact(value: Contact): Contact {
  const phone = value.phone?.replace(/\D/g, '');
  const email = value.email?.trim().toLowerCase();
  const wechat = value.wechat?.trim().toLowerCase();
  return {
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(wechat ? { wechat } : {}),
  };
}

export function contactHash(value: Contact): string {
  const normalized = normalizeContact(value);
  return createHmac('sha256', hmacKey())
    .update(JSON.stringify({ phone: normalized.phone || '', email: normalized.email || '', wechat: normalized.wechat || '' }))
    .digest('hex');
}

export function encryptContact(value: Contact): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(normalizeContact(value)), 'utf8'), cipher.final()]);
  const envelope: Envelope = {
    v: 1,
    kid: process.env.MARKETING_CONTACT_ENCRYPTION_KID || 'primary',
    alg: 'A256GCM',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
  return JSON.stringify(envelope);
}

export function decryptContact(value: string): Contact {
  const envelope = JSON.parse(value) as Envelope;
  if (envelope.v !== 1 || envelope.alg !== 'A256GCM') throw new Error('Unsupported contact envelope');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(envelope.iv, 'base64url'));
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString('utf8')) as Contact;
}
