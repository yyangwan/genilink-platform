// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubscriptionRequiredState } from '@/components/billing/subscription-required-state';

describe('SubscriptionRequiredState', () => {
  it('explains the entitlement state and links to subscription plans', () => {
    render(<SubscriptionRequiredState feature="趋势分析" />);

    expect(screen.getByText('订阅套餐后即可使用')).toBeTruthy();
    expect(screen.getByText(/趋势分析属于订阅功能/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /查看订阅套餐/ }).getAttribute('href')).toBe(
      '/settings/billing',
    );
  });
});
