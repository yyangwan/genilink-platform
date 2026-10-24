// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EvaluationCohortReview } from '@/components/visibility/evaluation-cohort-review';
import type { EvidenceRun } from '@/types/intelligence';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const hash = 'a'.repeat(64), promptHash = 'b'.repeat(64);
const cell = { prompt_hash: promptHash, prompt: '有哪些企业方案', category: 'recommend', eligibility: 'needs_review', eligibility_reason: 'neutrality_not_verified' };
const state = { base: { hash, cells: [cell] }, cohort: { hash, cells: [cell] }, latest_review_version: 0 };
const run = { id: 'r'.repeat(32), status: 'partial' } as EvidenceRun;
const response = (data: unknown, status = 200) => ({ ok: status < 400, status, json: async () => data });

it('requires rationale, permits an unresolved decision, and reports a pending revision', async () => {
  const saved = vi.fn(), fetcher = vi.fn().mockResolvedValueOnce(response(state)).mockResolvedValueOnce(response({ version: 1, refresh_pending: true }, 202));
  vi.stubGlobal('fetch', fetcher);
  render(<EvaluationCohortReview projectId="p1" run={run} onSaved={saved} />);
  await screen.findByLabelText(cell.prompt);
  fireEvent.click(screen.getByRole('button', { name: '保存范围审核' }));
  expect(screen.getByRole('alert').textContent).toContain('审核依据');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('审核依据'), { target: { value: '选型范围尚需业务负责人进一步核对' } });
  fireEvent.click(screen.getByRole('button', { name: '保存范围审核' }));
  await screen.findByText(/审核已保存，等待新分析修订/);
  const body = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(body).toMatchObject({ projectId: 'p1', runId: run.id, baseHash: hash, expectedVersion: 0, decisions: { [promptHash]: 'needs_review' } });
  expect(saved).toHaveBeenCalledTimes(1);
});

it('retries an uncertain write with exactly the same body and idempotency key', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response(state)).mockRejectedValueOnce(Error('private upstream detail')).mockResolvedValueOnce(response({}, 202));
  vi.stubGlobal('fetch', fetcher);
  render(<EvaluationCohortReview projectId="p1" run={run} onSaved={vi.fn()} />);
  await screen.findByLabelText(cell.prompt);
  fireEvent.change(screen.getByLabelText('审核依据'), { target: { value: '这是需要逐项核对的中性需求问题' } });
  fireEvent.change(screen.getByLabelText(cell.prompt), { target: { value: 'eligible' } });
  fireEvent.click(screen.getByRole('button', { name: '保存范围审核' }));
  await screen.findByRole('button', { name: '使用相同请求重试' });
  expect(screen.queryByText(/private upstream/)).toBeNull();
  expect((screen.getByLabelText('审核依据') as HTMLTextAreaElement).matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '使用相同请求重试' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[2][1].body);
});

it('loads the latest decisions and CAS version instead of silently reusing an old report', async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ ...state, latest_review_version: 2, latest_cohort: { hash: 'c'.repeat(64), cells: [{ ...cell, eligibility: 'excluded' }] } }));
  vi.stubGlobal('fetch', fetcher);
  render(<EvaluationCohortReview projectId="p1" run={run} onSaved={vi.fn()} />);
  expect((await screen.findByLabelText(cell.prompt) as HTMLSelectElement).value).toBe('excluded');
  expect(screen.getByText(/当前审核决定版本：2/)).toBeTruthy();
});

it('keeps a brand-directed question excluded', async () => {
  const directed = { ...cell, eligibility: 'excluded' };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...state, base: { hash, cells: [directed] }, cohort: { hash, cells: [directed] } })));
  render(<EvaluationCohortReview projectId="p1" run={run} onSaved={vi.fn()} />);
  const select = await screen.findByLabelText(cell.prompt) as HTMLSelectElement;
  expect(select.value).toBe('excluded');
  expect(select.disabled).toBe(true);
});
