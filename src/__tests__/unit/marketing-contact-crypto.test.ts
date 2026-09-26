import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contactHash, decryptContact, encryptContact } from '@/lib/marketing/contact-crypto';

describe('marketing contact encryption', () => {
  beforeEach(() => {
    vi.stubEnv('MARKETING_CONTACT_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
    vi.stubEnv('MARKETING_CONTACT_ENCRYPTION_KID', 'test-key');
    vi.stubEnv('MARKETING_CONTACT_HMAC_SECRET', 'test-hmac-key');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('round trips normalized contact details without storing plaintext in the envelope', () => {
    const encrypted = encryptContact({ phone: '+86 138-0013-8000', email: ' Sales@Example.COM ' });
    expect(encrypted).not.toContain('13800138000');
    expect(encrypted).not.toContain('sales@example.com');
    expect(JSON.parse(encrypted)).toMatchObject({ v: 1, kid: 'test-key', alg: 'A256GCM' });
    expect(decryptContact(encrypted)).toEqual({ phone: '8613800138000', email: 'sales@example.com' });
  });

  it('creates a stable hash for equivalent normalized contact details', () => {
    expect(contactHash({ email: 'Owner@Example.com ' })).toBe(contactHash({ email: 'owner@example.com' }));
  });

  it('fails authentication when the encryption key changes', () => {
    const encrypted = encryptContact({ wechat: 'customer_01' });
    vi.stubEnv('MARKETING_CONTACT_ENCRYPTION_KEY', Buffer.alloc(32, 9).toString('base64'));
    expect(() => decryptContact(encrypted)).toThrow();
  });
});
