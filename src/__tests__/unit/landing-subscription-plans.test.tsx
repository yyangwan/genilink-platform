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
    expect(screen.getByRole('heading', { name: '按你的团队阶段，选择最合适的版本' })).toBeTruthy();
    expect(screen.getByText(/个人或小团队可从入门版验证机会/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /查看详细说明/ }).getAttribute('href')).toBe('/pricing-guide');
    expect(screen.getByText('内测期间各套餐仅 ¥1')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '定制方案' })).toBeTruthy();
    expect(screen.getByText('托管运营，按结果付费')).toBeTruthy();
    expect(screen.getByText('私有化部署')).toBeTruthy();
    expect(screen.getByRole('link', { name: /联系客服定制/ }).getAttribute('href')).toMatch(/^mailto:support@genilink\.cn/);
  });
});
