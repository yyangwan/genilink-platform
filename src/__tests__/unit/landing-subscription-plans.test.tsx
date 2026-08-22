// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingSubscriptionPlans } from '@/components/billing/subscription-plans';

describe('LandingSubscriptionPlans', () => {
  it('renders unsupported matrix values as accessible X icons', () => {
    render(
      <LandingSubscriptionPlans
        plans={[]}
        billingCycle="monthly"
        onBillingCycleChange={vi.fn()}
      />,
    );

    const unsupportedCells = screen.getAllByLabelText('不支持');
    expect(unsupportedCells.length).toBeGreaterThan(0);
    expect(unsupportedCells.every((cell) => cell.querySelector('svg'))).toBe(true);
    expect(screen.queryByText('不支持')).toBeNull();
    expect(screen.getByText('暂未开放')).toBeTruthy();
    expect(screen.getByRole('link', { name: /查看详细说明/ }).getAttribute('href')).toBe('/pricing-guide');
  });
});
