// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ObservationWorkspace } from '@/components/visibility/observation-workspace';
import { ObservationResults } from '@/components/visibility/observation-results';
import { project, actionId, runId, run, cohort, cohortId, retest, result, options, publication } from '../fixtures/observation';
let posts: string[], frozen: ReturnType<typeof cohort>[], records: ReturnType<typeof retest>[], saved: ReturnType<typeof result>[], timeout: boolean, startTimeout: boolean, readonly: boolean;
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
beforeEach(() => {
  posts = []; frozen = []; records = []; saved = []; timeout = false; startTimeout = false; readonly = false;
  window.history.replaceState({}, '', `/?project=${project}&actionId=${actionId}`);
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(String(init.body)); if (timeout) { timeout = false; throw Error('timeout'); }
      const body = JSON.parse(String(init.body));
      if (body.action === 'createCohort') { frozen = [cohort()]; return response(cohort(), 202); }
      if (body.action === 'startRetest') { records = [retest()]; if (startTimeout) { startTimeout = false; throw Error('accepted but disconnected'); } return response({ id: retest().id, cohort_id: cohortId, audit_id: '2' }, 202); }
      if (body.action === 'retryRetest') return response({ repaired_samples: [{ platform: 'doubao' }] }, 202);
      if (body.action === 'compareCohort') { saved = [result()]; return response(result(), 202); }
      if (body.action === 'recordAsset') return response(publication(), 202);
      throw Error('Unexpected write');
    }
    const view = new URL(input, 'http://localhost').searchParams.get('view');
    if (view === 'publicationActions') return response({ actions: [{ id: actionId, title: options().action_title, revision: 3, revision_id: options().revision_id, run_id: runId, integrity_valid: true, task_pack_available: true }], next_before: null, can_write: !readonly });
    if (view === 'cohorts') return response({ cohorts: frozen, next_before: null, can_write: !readonly });
    if (view === 'publicationOptions') return response({ ...options(), can_write: !readonly, can_register: !readonly });
    if (view === 'assets') return response({ assets: [publication()], next_before: null, can_write: !readonly });
    if (view === 'retests') return response({ retests: records });
    if (view === 'measurementResults') return response({ results: saved });
    throw Error('Unexpected read');
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<ObservationWorkspace projectId={project} run={run} onOpenEvidence={vi.fn()} />);
it('freezes own and unregistered brands, retains original platform scope and starts exactly one retest in place', async () => {
  mount(); fireEvent.click(await screen.findByLabelText(/锐川/));
  fireEvent.click(screen.getByRole('button', { name: '开始一次复测' }));
  await screen.findByText(/完整回答 1\/2/);
  expect(JSON.parse(posts[0])).toMatchObject({ action: 'createCohort', comparisonMode: 'descriptive_v1', brandTargetIds: ['registry:own', 'entity:rival'], platforms: ['qwen', 'doubao'], actionId, expectedActionRevision: 3 });
  expect(JSON.parse(posts[1])).toMatchObject({ action: 'startRetest', cohortId });
  expect(window.location.pathname).toBe('/');
  fireEvent.click(screen.getByRole('button', { name: '整理本次观察' }));
  await screen.findByRole('tab', { name: '锐川 · 未登记品牌' });
  expect(screen.getAllByText('数据缺失').length).toBeGreaterThan(0);
});
it('keeps the exact uncertain request and disables editable scope before retry', async () => {
  mount(); await screen.findByLabelText(/锐川/); timeout = true;
  fireEvent.click(screen.getByRole('button', { name: '开始一次复测' }));
  fireEvent.click(await screen.findByRole('button', { name: '重试同一操作' }));
  await screen.findByText(/完整回答 1\/2/);
  expect(posts).toHaveLength(3); expect(posts[0]).toBe(posts[1]);
});
it('repairs missing answers with the frozen stamp instead of starting another audit', async () => {
  frozen = [cohort()]; records = [retest()]; window.history.replaceState({}, '', `/?project=${project}&cohortId=${cohortId}`);
  mount(); fireEvent.click(await screen.findByRole('button', { name: '补齐未完成项' }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(JSON.parse(posts[0])).toMatchObject({ action: 'retryRetest', cohortId, retestId: retest().id, expectedRetryStamp: retest().retry_stamp });
  expect(screen.queryByRole('button', { name: '开始一次复测' })).toBeNull();
});
it('replays the same capture key after scope freezing succeeded but capture acknowledgement was lost', async () => {
  mount(); await screen.findByLabelText(/锐川/); startTimeout = true;
  fireEvent.click(screen.getByRole('button', { name: '开始一次复测' }));
  await screen.findByRole('button', { name: '重试同一操作' });
  expect(screen.getByRole('button', { name: '新建一次观察' })).toBeDisabled();
  expect(screen.getByLabelText('观察记录')).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '重试同一操作' }));
  await screen.findByText('复测已受理，正在分平台采集。进度会在本页更新。');
  expect(posts).toHaveLength(3); expect(posts[1]).toBe(posts[2]);
  expect(posts.filter(row => JSON.parse(row).action === 'createCohort')).toHaveLength(1);
});
it('registers the selected delivered version and opens a new draft without changing the old cohort', async () => {
  frozen = [cohort()]; window.history.replaceState({}, '', `/?project=${project}&cohortId=${cohortId}`); mount();
  fireEvent.click(await screen.findByRole('button', { name: '登记已发布资产' }));
  fireEvent.change(screen.getByLabelText('已交付版本'), { target: { value: `${options().deliveries[0].delivery_event_id}:0` } });
  fireEvent.change(screen.getByLabelText('发布地址'), { target: { value: 'https://example.com/published' } });
  fireEvent.change(screen.getByLabelText('实际发布时间（北京时间）'), { target: { value: '2026-10-24T18:00' } });
  fireEvent.change(screen.getByLabelText('登记依据'), { target: { value: '已核对实际发布时间与交付版本' } });
  fireEvent.click(screen.getByLabelText('我已核对发布地址、内容版本和发布时间。'));
  fireEvent.click(screen.getByRole('button', { name: '保存发布登记' }));
  await screen.findByRole('button', { name: '开始一次复测' });
  const body = JSON.parse(posts[0]); expect(body).toMatchObject({ expectedRevision: 3, deliveryEventId: options().deliveries[0].delivery_event_id, publishedAt: '2026-10-24T10:00:00.000Z', versionConfirmed: true });
  expect(body).not.toHaveProperty('contentHash'); expect(frozen[0]).toEqual(cohort());
});
it('preserves an invalid deep link and disables all writes for viewers', async () => {
  readonly = true; window.history.replaceState({}, '', `/?project=${project}&actionId=${'9'.repeat(32)}`); mount();
  await screen.findByText('指定行动不存在或无权读取，请重新选择。');
  expect(screen.getByRole('button', { name: '新建一次观察' })).toBeDisabled(); expect(posts).toEqual([]);
});
it('does not display stale deltas and separates source unknowns from answer absence', () => {
  const value = result(); value.snapshot_current = false;
  render(<ObservationResults result={value} cohort={cohort()} />);
  expect(screen.queryByText('+15.0 分')).toBeNull(); expect(screen.queryByText('本次由未出现到出现')).toBeNull();
  expect(screen.getAllByText('未知').length).toBeGreaterThan(0); expect(screen.getAllByText('数据缺失').length).toBeGreaterThan(0);
});
