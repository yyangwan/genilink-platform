// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ResultReadiness } from '@/components/visibility/result-readiness';
import type { ResultReadiness as Readiness } from '@/types/intelligence';

afterEach(cleanup);
it('shows a provider blocker without calling it a missing brand or a zero score', () => {
  const remedy = vi.fn();
  const data: Readiness = { version: 'result-readiness-v1', items: [{ key: 'semantics', title: '语义分析', state: 'blocked', completed: 0, total: 184, reason_codes: ['analysis_provider_insufficient_balance'], detail: '分析服务额度不足，需要管理员恢复后生成新分析修订。', remedy: { view: 'evidence', action: 'inspect_analysis', label: '查看分析状态' } }] };
  render(<ResultReadiness readiness={data} onRemedy={remedy} />);
  expect(screen.getByText('需要处理')).toBeTruthy();
  expect(screen.getByText('0 / 184')).toBeTruthy();
  expect(screen.queryByText('没有品牌')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '查看分析状态 →' }));
  expect(remedy).toHaveBeenCalledWith(data.items[0].remedy);
});
it('keeps missing prerequisite data explicitly unknown', () => {
  render(<ResultReadiness onRemedy={vi.fn()} />);
  expect(screen.getByRole('status').textContent).toContain('暂不推断品牌缺席');
});
