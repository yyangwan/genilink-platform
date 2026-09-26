export const COMMERCIAL_OFFER = {
  offerId: 'public-launch-2026-09',
  effectiveFrom: '2026-09-26T00:00:00+08:00',
  currency: 'CNY',
  plans: {
    lite: { monthlyPriceCents: 9_900, yearlyPriceCents: 99_900 },
    pro: { monthlyPriceCents: 39_900, yearlyPriceCents: 399_900 },
    max: { monthlyPriceCents: 129_900, yearlyPriceCents: 1_299_900 },
  },
} as const;
