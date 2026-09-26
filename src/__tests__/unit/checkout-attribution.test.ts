import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    acquisitionSession: {
      findFirst: mocks.findFirst,
      update: mocks.update,
    },
  },
}));

import { resolveCheckoutAttribution } from '@/lib/marketing/checkout-attribution';

describe('checkout attribution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('MARKETING_HMAC_SECRET', 'test-secret');
  });

  it('ignores malformed visitor cookies without querying the database', async () => {
    await expect(resolveCheckoutAttribution('short', 'user-1')).resolves.toBeNull();
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it('binds an anonymous visitor and returns an immutable attribution snapshot', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'visitor-1',
      userId: null,
      firstTouch: { utm_source: 'xiaohongshu' },
      lastTouch: { utm_source: 'baidu' },
      firstSource: 'xiaohongshu',
      firstMedium: 'organic',
      firstCampaign: 'launch',
      lastSource: 'baidu',
      lastMedium: 'search',
      lastCampaign: 'brand',
    });
    mocks.update.mockResolvedValue({});

    const result = await resolveCheckoutAttribution('v'.repeat(43), 'user-1');

    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'visitor-1' }, data: { userId: 'user-1' } });
    expect(result).toMatchObject({
      acquisitionSessionId: 'visitor-1',
      attributionSnapshot: { firstSource: 'xiaohongshu', lastSource: 'baidu' },
    });
  });

  it('does not attach a visitor already bound to another user', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'visitor-1', userId: 'user-2' });
    await expect(resolveCheckoutAttribution('v'.repeat(43), 'user-1')).resolves.toBeNull();
  });
});
