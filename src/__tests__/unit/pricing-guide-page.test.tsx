// @vitest-environment jsdom
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PricingGuidePage from '@/app/pricing-guide/page';

describe('PricingGuidePage', () => {
  it('explains plan levels, usage accounting, and current integration boundaries', () => {
    render(<PricingGuidePage />);

    expect(screen.getByRole('heading', { name: '套餐权益，应该清楚到不需要猜' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '基础版、完整版和高级版差在哪里' })).toBeTruthy();
    expect(screen.getByText(/每次最多展示 3 条优先建议/)).toBeTruthy();
    expect(screen.getByText(/标准内容生成、Genie 创作及从优化建议生成内容简报/)).toBeTruthy();
    expect(screen.getByText(/当前所有套餐均未开放公开 API/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /查看套餐矩阵/ }).getAttribute('href')).toBe('/#pricing');
  });
});
