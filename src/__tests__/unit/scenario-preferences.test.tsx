// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScenarioPreferences } from '@/components/visibility/scenario-preferences';
import { quoteSpans, validQuestionContexts } from '@/lib/visibility/question-context';
import { SCENARIOS } from '@/lib/visibility/scenarios';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const current = { mode: 'neutral', contextVersion: 2, importance: Object.fromEntries(Object.keys(SCENARIOS).map(key => [key, 50])), reason: null };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
it('saves eight scenario priorities and retries the exact uncertain request', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(current)).mockRejectedValueOnce(Error('private failure')).mockResolvedValueOnce(response({ ...current, contextVersion: 3, syncPending: true }));
  vi.stubGlobal('fetch', fetcher);
  render(<ScenarioPreferences projectId="p1" />);
  await screen.findByText(/配置版本 2/);
  fireEvent.change(screen.getByLabelText('业务偏好'), { target: { value: 'custom' } });
  fireEvent.change(screen.getByLabelText('价格与成本'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('设置理由'), { target: { value: '本季度优先回应成本问题' } });
  fireEvent.click(screen.getByRole('button', { name: '保存排序偏好' }));
  await screen.findByRole('button', { name: '使用相同请求重试' });
  expect(screen.queryByText(/private failure/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '使用相同请求重试' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ expectedVersion: 2, preferences: { scenario_importance: { cost: 100 }, reason: '本季度优先回应成本问题' } });
  await screen.findByText(/后台同步尚未确认/);
});
it('keeps reset rationale and does not invent custom priorities', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response({ ...current, contextVersion: 3 }));
  vi.stubGlobal('fetch', fetcher);
  render(<ScenarioPreferences projectId="p1" />);
  await screen.findByText(/配置版本 2/);
  fireEvent.change(screen.getByLabelText('设置理由'), { target: { value: '恢复默认场景等权排序' } });
  fireEvent.click(screen.getByRole('button', { name: '保存排序偏好' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).preferences).toEqual({ version: 'business-preferences-v1', scenario_importance: {}, reason: '恢复默认场景等权排序' });
});
it('uses Unicode code points for question evidence and refuses ambiguous quotes', () => {
  expect(quoteSpans('🧭预算有限', '预算')).toEqual([{ quote: '预算', start: 1, end: 3 }]);
  expect(() => quoteSpans('预算与预算', '预算')).toThrow();
  expect(() => quoteSpans('实际问题', '回答中的内容')).toThrow();
  expect(validQuestionContexts({ ['a'.repeat(64)]: { status: 'confirmed', primaryScenario: 'cost', secondaryScenarios: [], brandScope: 'neutral', brandReferences: [], requirements: [{ quote: '预算', start: true, end: 3 }] } })).toBe(false);
});
