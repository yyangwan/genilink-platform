import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findLead: vi.fn(), updateLead: vi.fn(), createPrivacyEvent: vi.fn(), cancelDeliveries: vi.fn(), transaction: vi.fn(), rateLimit: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/marketing/rate-limit', () => ({ consumeFixedWindowRateLimit: mocks.rateLimit }));
vi.mock('@/lib/db', () => ({ prisma: {
  marketingLead: { findUnique: mocks.findLead },
  $transaction: mocks.transaction,
} }));

import { LeadWithdrawalNotFoundError, withdrawMarketingLeadContact } from '@/lib/marketing/leads';

const token = 'a'.repeat(43);

describe('marketing lead contact withdrawal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('MARKETING_HMAC_SECRET', 'test-marketing-secret');
    mocks.rateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.findLead.mockResolvedValue({
      id: 'lead_1', withdrawalTokenHash: createHash('sha256').update(token).digest('hex'), contactWithdrawnAt: null,
    });
    mocks.updateLead.mockResolvedValue({ count: 1 });
    mocks.createPrivacyEvent.mockResolvedValue({ id: 'privacy_1' });
    mocks.cancelDeliveries.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      marketingLead: { updateMany: mocks.updateLead },
      marketingLeadPrivacyEvent: { create: mocks.createPrivacyEvent },
      leadNotificationDelivery: { updateMany: mocks.cancelDeliveries },
    }));
  });

  it('clears recoverable contact data, audits the action and cancels pending notifications', async () => {
    const result = await withdrawMarketingLeadContact({ leadId: 'lead_1', token, reason: '撤回', clientIp: '203.0.113.9' });
    expect(result.alreadyWithdrawn).toBe(false);
    expect(mocks.updateLead).toHaveBeenCalledWith({
      where: { id: 'lead_1', contactWithdrawnAt: null },
      data: { contactCiphertext: null, contactHash: null, contactWithdrawnAt: expect.any(Date), version: { increment: 1 } },
    });
    expect(mocks.createPrivacyEvent).toHaveBeenCalledWith({ data: {
      leadId: 'lead_1', action: 'contact_consent_withdrawn', reason: '撤回',
    } });
    expect(mocks.cancelDeliveries).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'canceled', lastError: 'CONTACT_WITHDRAWN' }),
    }));
  });

  it('does not reveal a lead when the credential is invalid', async () => {
    await expect(withdrawMarketingLeadContact({ leadId: 'lead_1', token: 'b'.repeat(43), clientIp: '203.0.113.9' }))
      .rejects.toBeInstanceOf(LeadWithdrawalNotFoundError);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
