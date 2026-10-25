// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { SourceLibrary } from '@/components/visibility/citation-prototype-views';
import { groupSources, loadSourceObservations, sourceObservationSchema } from '@/lib/visibility/source-observation';
import { observation, projectId, sourcePage, sourceRun, sourceRunId, sourceText } from '../fixtures/source-observations';

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const onOpenAnswer = vi.fn(), onOpenSource = vi.fn(), onRetry = vi.fn();
function mount(run = sourceRun()) { return render(<SourceLibrary run={run} projectId={projectId} onOpenAnswer={onOpenAnswer} onOpenSource={onOpenSource} onRetry={onRetry} retrying={null} />); }
const open = async (count = 1) => { fireEvent.click(await screen.findByRole('button', { name: `展开 ${count} 条观察 →` })); return screen.findByRole('dialog', { name: '文章版本与逐次来源观察' }); };
beforeEach(() => {
  vi.clearAllMocks(); window.history.replaceState({}, '', '/?sourceType=observed');
  HTMLDialogElement.prototype.showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function(this: HTMLDialogElement) { this.open = false; });
  vi.stubGlobal('fetch', vi.fn(async (input: string) => new URL(input, 'http://localhost').searchParams.get('view') === 'content'
    ? reply({ items: [{ id: '9'.repeat(32), start: 0, end: Array.from(sourceText).length, text: sourceText }], next_offset: null }) : reply(sourcePage())));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('groups by article identity and preserves per-platform types, version and original run', async () => {
  const candidate = observation({ id: '6'.repeat(32), response_id: '6'.repeat(32), platform: 'qwen', kind: 'search_candidate', actual_reference: false,
    snapshot_id: '7'.repeat(32), snapshot_version: { ...observation().snapshot_version!, id: '7'.repeat(32) }, answer_anchor: { version: 'answer-anchor-v1', answer_hash: '2'.repeat(64), status: 'unavailable', reason: 'not_captured' } });
  vi.mocked(fetch).mockResolvedValue(reply(sourcePage([observation(), candidate])));
  mount(); const dialog = await open(2);
  const cards = dialog.querySelectorAll('article'); expect(cards).toHaveLength(2);
  expect(cards[0]).toHaveTextContent('回答实际引用'); expect(cards[0]).toHaveTextContent('适合😀门');
  expect(cards[1]).toHaveTextContent('检索候选'); expect(cards[1].querySelector('.source-tag--reference')).toBeNull();
  expect(cards[1]).toHaveTextContent('未采集到精确引用锚点'); expect(cards[1]).not.toHaveTextContent('已生成的观点核验');
  fireEvent.click(within(cards[1] as HTMLElement).getByRole('button', { name: '打开该次正文版本 →' }));
  expect(onOpenSource).toHaveBeenCalledWith('7'.repeat(32), candidate.title, sourceRunId);
  await open(2); fireEvent.click(screen.getAllByRole('button', { name: '打开这条保存回答 →' })[1]);
  expect(onOpenAnswer).toHaveBeenCalledWith(candidate.response_id, sourceRunId);
});

it('applies platform and saved status to the same observation without borrowing another body', async () => {
  const unknown = observation({ id: '6'.repeat(32), response_id: '6'.repeat(32), platform: 'qwen', snapshot_id: null, snapshot_version: null, content_family: null, content_coverage: null, frozen_version_valid: false, fetch_status: 'blocked' });
  vi.mocked(fetch).mockResolvedValue(reply(sourcePage([observation(), unknown]))); mount(); await screen.findByRole('button', { name: '展开 2 条观察 →' });
  fireEvent.change(screen.getByLabelText('筛选来源平台'), { target: { value: 'qwen' } });
  expect(screen.getByText('0 / 1 条正文可回查')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('筛选来源状态或类型'), { target: { value: 'saved' } });
  expect(screen.queryByRole('button', { name: /展开 .* 条观察/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('筛选来源状态或类型'), { target: { value: 'unavailable' } });
  const dialog = await open(); expect(dialog).toHaveTextContent('访问受限，未取得正文'); expect(dialog).not.toHaveTextContent('正文开头');
  expect(within(dialog).queryByRole('button', { name: '打开该次正文版本 →' })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: '补采这篇来源文章 →' })); expect(onRetry).toHaveBeenCalledWith(unknown.document_id);
});

it('keeps analysis coverage, unchecked ranges, five-dimensional verdicts and independence separate', async () => {
  mount(); const dialog = await open();
  expect(dialog).toHaveTextContent('2400 / 5000 字符'); expect(dialog).toHaveTextContent('原文章完整性未知');
  const summary = within(dialog).getByText(/回答观点 · 已核验/); fireEvent.click(summary);
  expect(dialog).toHaveTextContent('未核验范围：1000–5000'); expect(dialog).toHaveTextContent('预算或处理条件限制，未核验');
  expect(dialog).toHaveTextContent('范围 · 部分支持'); expect(dialog).toHaveTextContent('时间 · 无法核验');
  expect(dialog).toHaveTextContent('同家族解释有冲突'); expect(dialog).toHaveTextContent('近似转载候选家族');
  expect(dialog).toHaveTextContent('发布者独立性与原创归属未知');
});

it('shows own and unregistered source brands without borrowing them into a platform with no body', async () => {
  const run = sourceRun(); run.summary.entities = [{ id: 'own', name: '我方', role: 'own', identity_status: 'confirmed', kind: 'brand', response_count: 0, source_mentions: 1, platform_response_counts: {} }];
  run.summary.mentions = [{ id: 'm1', entity_id: 'own', entity_name: '我方', owner_kind: 'snapshot', owner_id: 'e'.repeat(32), quote: '我方', sentiment: 'neutral' },
    { id: 'm2', entity_id: 'new', entity_name: '新发现主体', owner_kind: 'snapshot', owner_id: 'e'.repeat(32), quote: '新发现主体', sentiment: 'neutral' }];
  vi.mocked(fetch).mockResolvedValue(reply(sourcePage([observation(), observation({ id: 'candidate', platform: 'qwen', snapshot_id: null, frozen_version_valid: false, snapshot_version: null, content_coverage: null, content_family: null })])));
  mount(run); await screen.findByRole('button', { name: '展开 2 条观察 →' });
  expect(screen.getByText('我方 · 自有品牌')).toBeInTheDocument(); expect(screen.getByText('新发现主体 · 身份待确认')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('筛选来源平台'), { target: { value: 'qwen' } });
  expect(screen.queryByText('我方 · 自有品牌')).toBeNull(); expect(screen.queryByText('新发现主体 · 身份待确认')).toBeNull();
});

it('lets users inspect related family articles without treating copies as independent support', async () => {
  vi.mocked(fetch).mockResolvedValue(reply(sourcePage([observation(), observation({ id: 'peer', document_id: 'peer-article', title: '转载候选文章', snapshot_id: '5'.repeat(32), snapshot_version: { ...observation().snapshot_version!, id: '5'.repeat(32) } })])));
  mount(); fireEvent.click((await screen.findAllByRole('button', { name: '展开 1 条观察 →' }))[0]);
  const dialog = await screen.findByRole('dialog', { name: '文章版本与逐次来源观察' });
  fireEvent.click(within(dialog).getByText('查看同家族的其他文章 · 1 篇'));
  fireEvent.click(within(dialog).getByRole('button', { name: '核对该文章的 1 条观察 →' }));
  expect(dialog.querySelector('.source-article-title')).toHaveTextContent('转载候选文章'); expect(dialog).toHaveTextContent('发布者独立性与原创归属未知');
});

it('reads an exact Unicode source span from this observation and returns to the article', async () => {
  mount(); await open(); fireEvent.click(screen.getByRole('button', { name: '定位核验的来源原文 →' }));
  await waitFor(() => expect(document.querySelector('mark')).toHaveTextContent('😀适合多区域部署'));
  const url = String(vi.mocked(fetch).mock.calls.at(-1)?.[0]); expect(url).toContain(`runId=${sourceRunId}`); expect(url).toContain(`ownerId=${'e'.repeat(32)}`);
  fireEvent.click(screen.getByRole('button', { name: '关闭核验原文' })); expect(await screen.findByRole('dialog', { name: '文章版本与逐次来源观察' })).toBeInTheDocument();
});

it('blocks a mismatched frozen version and does not display foreign citation evidence', async () => {
  vi.mocked(fetch).mockResolvedValue(reply(sourcePage([observation({ frozen_version_valid: false })])));
  const run = sourceRun(); run.summary.claim_evidence![0].citation_id = 'other'; mount(run); const dialog = await open();
  expect(dialog).toHaveTextContent('绑定版本校验未通过'); expect(within(dialog).queryByRole('button', { name: '打开该次正文版本 →' })).toBeNull();
  expect(dialog).not.toHaveTextContent('已生成的观点核验'); expect(dialog).toHaveTextContent('保存文字完整性未知');
});

it('does not merge missing article IDs even when titles and URLs match, and rejects type/anchor corruption', () => {
  const left = observation({ document_id: null }), right = observation({ id: 'other', document_id: null });
  expect(groupSources([left, right], { platform: '', status: 'all', query: '' })).toHaveLength(2);
  expect(sourceObservationSchema.safeParse({ ...left, actual_reference: false }).success).toBe(false);
  expect(sourceObservationSchema.safeParse({ ...left, answer_anchor: { ...left.answer_anchor, end: 7 } }).success).toBe(false);
});

it('reads every bounded page before publishing totals and rejects skipped/repeated or changing pages', async () => {
  const second = observation({ id: 'second' });
  vi.mocked(fetch).mockResolvedValueOnce(reply(sourcePage([observation()], { total: 2, next_offset: 1 }))).mockResolvedValueOnce(reply(sourcePage([second], { total: 2 })));
  expect((await loadSourceObservations(projectId, sourceRunId, new AbortController().signal)).items).toHaveLength(2);
  expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('offset=1');
  for (const changed of [sourcePage([observation()], { total: 2 }), sourcePage([second], { total: 3 }), sourcePage([second], { total: 2, next_offset: 1 })]) {
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(reply(sourcePage([observation()], { total: 2, next_offset: 1 }))).mockResolvedValueOnce(reply(changed));
    await expect(loadSourceObservations(projectId, sourceRunId, new AbortController().signal)).rejects.toThrow('分页');
  }
});

it('does not claim zero sources for pending or failed loads and allows read-only retry', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(reply(sourcePage([], { status: 'pending', version: null, content_family_coverage: null }))).mockResolvedValueOnce(reply({}, 503)).mockResolvedValueOnce(reply(sourcePage()));
  mount(); expect(await screen.findByText(/尚未发布来源观察/)).toBeInTheDocument(); expect(screen.queryByText('归并文章')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '重新读取 →' })); expect(await screen.findByRole('alert')).toHaveTextContent('暂不可读');
  fireEvent.click(screen.getByRole('button', { name: '重新读取 →' })); await screen.findByRole('button', { name: '展开 1 条观察 →' });
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it('keeps viewer access read-only and retains the current human verification alongside model output', async () => {
  vi.mocked(fetch).mockResolvedValue(reply(sourcePage([observation({ snapshot_id: null, snapshot_version: null, frozen_version_valid: false })], { can_write: false })));
  mount(); const dialog = await open(); expect(within(dialog).queryByRole('button', { name: /补采/ })).toBeNull();
  cleanup(); vi.mocked(fetch).mockResolvedValue(reply(sourcePage()));
  const run = sourceRun(); run.claim_reviews = { ['0'.repeat(32)]: { id: 'review', version: 2, relation: 'contradicts', source_quote: '人工保存引文', reason: '核对时间和范围后存在差异' } };
  mount(run); expect(await open()).toHaveTextContent('人工复核：存在冲突 · 核对时间和范围后存在差异');
});

it('discards stale results when project/run selection changes', async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(done => { resolve = done; })).mockResolvedValue(reply(sourcePage([], { content_family_coverage: null })));
  const view = mount(); const next = { ...sourceRun(), id: 'f'.repeat(32) };
  view.rerender(<SourceLibrary run={next} projectId="new-project" onOpenAnswer={onOpenAnswer} onOpenSource={onOpenSource} onRetry={onRetry} retrying={null} />);
  await screen.findByText(/本次已发布结果没有来源观察/); await act(async () => { resolve(reply(sourcePage())); });
  expect(screen.queryByRole('button', { name: '展开 1 条观察 →' })).toBeNull();
  expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
});
