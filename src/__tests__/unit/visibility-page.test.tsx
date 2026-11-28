// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AuditCaptureSummary, AuditScoreReport } from '@/lib/visibility/v4-audit';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');
  const watch = (fn: () => void) => {
    window.addEventListener('audit-test-nav', fn);
    return () => window.removeEventListener('audit-test-nav', fn);
  };
  return {
    useSearchParams: () => new URLSearchParams(useSyncExternalStore(watch, () => window.location.search)),
    useRouter: () => ({ replace }),
  };
});
vi.mock('@/components/project/project-context', () => ({ useProject: () => ({ currentProjectId: 'p1', projects: [], loading: false, openWizard: vi.fn() }) }));
vi.mock('@/components/visibility/use-visibility-dashboard', () => ({ useVisibilityDashboard: vi.fn() }));

import { useVisibilityDashboard } from '@/components/visibility/use-visibility-dashboard';
import VisibilityPage from '@/app/(dashboard)/visibility/page';
import { AuditInsightV4 } from '@/components/visibility/audit-insight-v4';
import { CaptureRecordDrawer } from '@/components/visibility/capture-records-v4';

const opportunity = 'f'.repeat(64);
const sampleId = 'a'.repeat(32), snapshotId = 'b'.repeat(32), runId = 'c'.repeat(32), attemptId = 'd'.repeat(32);
const dashboard = (hasAudit: boolean, canCapture: boolean) => ({
  data: {
    schema: 'citation-dashboard-1' as const, project_id: 'p1', enabled: true, processing: false,
    latest_audit: hasAudit ? { id: '12', status: 'completed', stage: 'done', created_at: '2026-11-15', platforms: ['qwen'] } : null,
    report: null, can_capture: canCapture,
  },
  loading: false, error: false, locked: false, refetch: vi.fn(),
});
const capture = (state: string): AuditCaptureSummary => ({
  audit_id: '12', mode: 'v4', status: state === 'waiting_for_capture' ? 'running' : 'partial',
  published_run_id: state === 'completed' ? runId : null, can_write: true, poll_after_ms: null,
  platforms: [{ platform: 'qwen', failed: 0, pending: 0, planned: 1, received: 1 }],
  capture: { state: state === 'waiting_for_capture' ? 'collecting' : 'partial', planned: 2, received: 1, failed: 1, pending: 0, closed_at: null },
  archive: { state: 'settled', observed: 1, linked: 1, archived: 1, pending: 0, unavailable: 0, settled_at: null, deadline_at: null },
  analysis: { state, can_retry: state === 'failed', attempt_id: attemptId, attempt_no: 1, failure_reason: state === 'failed' ? 'analysis_failed' : null },
});

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/visibility');
  replace.mockImplementation((url: string) => {
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event('audit-test-nav'));
  });
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('visibility audit v4', () => {
  it('only submits the single collection after explicit confirmation', async () => {
    const project = dashboard(false, true);
    vi.mocked(useVisibilityDashboard).mockReturnValue(project);
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json({ audit_id: '12' });
      const query = new URL(url, 'http://localhost').searchParams;
      if (query.get('view') === 'prompts') return Response.json([{ id: 1, text: '有哪些方案' }]);
      if (query.get('view') === 'captureV4') return Response.json(capture('waiting_for_capture'));
      return Response.json({ items: [], next_cursor: null });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<VisibilityPage />);
    const start = screen.getByRole('button', { name: '开始本次采集' }) as HTMLButtonElement;
    await waitFor(() => expect(start.disabled).toBe(false));
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(start);
    const confirm = screen.getByRole('dialog', { name: '确认本次采集' });
    expect(within(confirm).getByText(/1 个提示词，共 5 个计划样本/)).toBeTruthy();
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(within(confirm).getByRole('button', { name: '确认开始采集' }));
    await screen.findByText('回答采集中');
    expect(replace).toHaveBeenCalledWith('/visibility?project=p1&auditId=12', { scroll: false });
    const post = fetcher.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ action: 'capture', promptIds: [1], rounds: 1 });
    expect(screen.queryByLabelText('对比品牌')).toBeNull();
  });

  it('opens actual capture records and fetches a specific saved article on demand', async () => {
    vi.mocked(useVisibilityDashboard).mockReturnValue(dashboard(true, false));
    const opening = '🫘 平台返回的实际回答';
    const answer = `${opening}【1】\n\n### 选型比较\n\n1. **权限**说明 [2]\n2. 核对 \`[1]\`\n\n| 维度 | 条件 |\n| --- | --- |\n| 实施 | 先试点 |\n\n![外部图片](https://example.com/picture.png)\n\n<script>example</script>`;
    const markerStart = Array.from(opening).length;
    const codeMarkerStart = Array.from(answer.slice(0, answer.indexOf('[1]'))).length;
    const beforeImage = '🫘 图片前';
    const afterImage = '图片后';
    const archiveText = `${beforeImage}\n${afterImage}\n视频后`;
    const fetcher = vi.fn(async (url: string) => {
      const query = new URL(url, 'http://localhost').searchParams;
      if (query.get('view') === 'captureV4') return Response.json(capture('completed'));
      if (query.get('view') === 'captureSamples') return Response.json({ items: [{
        id: sampleId, platform: 'qwen', prompt_excerpt: '仓储问题', status: 'received', archived_count: 1, source_count: 1,
      }], next_cursor: null });
      if (query.get('view') === 'captureSample') return Response.json({
        id: sampleId, platform: 'qwen', status: 'received', prompt: { id: 1, text: '仓储问题' },
        attempts: [], answer: { text: answer, status: 'partial', references: [
          { start: markerStart, end: markerStart + 3, ordinal: 1 },
          { start: codeMarkerStart, end: codeMarkerStart + 3, ordinal: 1 },
        ] },
        sources: [{ ordinal: 1, title: '已保存的引用文章', url: 'https://example.com/article',
          archive: { status: 'archived', snapshot_id: snapshotId, has_media: true } }],
      });
      return Response.json({ text: archiveText, media: [
        { ordinal: 1, kind: 'image', text_offset: Array.from(beforeImage).length, label: '素材图', url: 'https://example.com/item.png', has_preview: true },
        { ordinal: 2, kind: 'video', text_offset: Array.from(`${beforeImage}\n${afterImage}`).length, label: '演示视频封面', url: 'https://example.com/video', has_preview: true },
      ] });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<VisibilityPage />);
    expect((await screen.findByRole('link', { name: '查看审计洞察' })).getAttribute('href'))
      .toBe('/intelligence?project=p1&auditId=12&view=overview&runId=' + runId);
    fireEvent.click(await screen.findByRole('button', { name: '查看记录' }));
    const drawer = await screen.findByRole('dialog', { name: '采集详情' });
    const original = await within(drawer).findByRole('region', { name: '原始回答' });
    expect(within(original).getByText(opening)).toBeTruthy();
    expect(within(original).getByText('已保存部分回答')).toBeTruthy();
    expect(within(original).getByRole('heading', { name: '选型比较' })).toBeTruthy();
    expect(within(original).getByRole('list')).toBeTruthy();
    expect(within(original).getByText('权限').tagName).toBe('STRONG');
    expect(within(original).getByRole('table')).toBeTruthy();
    expect(within(original).getByText(/说明 \[2\]/)).toBeTruthy();
    expect(original.querySelector('img, script')).toBeNull();
    expect(original.querySelector('code')?.textContent).toBe('[1]');
    const source = within(drawer).getByText('已保存的引用文章').closest('article')!;
    source.scrollIntoView = vi.fn();
    fireEvent.click(within(original).getByRole('button', { name: '定位引用 1' }));
    expect(document.activeElement).toBe(source);
    expect(source.scrollIntoView).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls.some(([url]) => url.includes('captureSource'))).toBe(false);
    fireEvent.click(within(drawer).getByRole('button', { name: '查看引用原文' }));
    const archived = (await within(drawer).findByRole('heading', { name: '引用正文原文' })).parentElement!;
    expect([...archived.children].map(element => element.tagName)).toEqual(['H4', 'DIV', 'FIGURE', 'DIV', 'FIGURE', 'DIV']);
    expect(within(archived).getByText(beforeImage)).toBeTruthy();
    expect(within(archived).getByRole('img', { name: '演示视频封面' }).getAttribute('src')).toContain('mediaOrdinal=2');
    fireEvent.error(within(archived).getByRole('img', { name: '演示视频封面' }));
    expect(within(archived).getByText('视频封面暂不可查看')).toBeTruthy();
    expect(within(archived).getByRole('link', { name: '打开原视频 ↗' }).getAttribute('href')).toBe('https://example.com/video');
    expect(fetcher.mock.calls.some(([url]) => url.includes('snapshotId=' + snapshotId))).toBe(true);
  });

  it('retains plain answer line breaks and puts the cover of a video-only reference in the original', async () => {
    const text = '  第一行\n第二行 [3]\n\n\n最后一行';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('view=captureSample')
      ? Response.json({ platform: 'doubao', status: 'received', prompt: { text: '示例' }, attempts: [],
        answer: { text, status: 'complete' }, sources: [{ ordinal: 1, title: '视频引用', url: 'https://example.com/v',
          archive: { status: 'unavailable', snapshot_id: snapshotId, has_media: true } }] })
      : Response.json({ text: '', media: [
        { ordinal: 1, kind: 'video', text_offset: null, label: '', url: 'https://example.com/v', has_preview: true },
      ] })));
    render(<CaptureRecordDrawer projectId="p1" auditId="12" sampleId={sampleId} onClose={vi.fn()} version={0} />);
    const original = await screen.findByRole('region', { name: '原始回答' });
    expect(original.querySelector('.v4-captured-answer')?.textContent).toBe(text);
    expect(within(original).queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看引用原文' }));
    const archive = (await screen.findByRole('heading', { name: '引用正文原文' })).parentElement!;
    expect(within(archive).getByText('该来源未取得文章正文。')).toBeTruthy();
    expect(within(archive).getByRole('img', { name: '来源视频封面' })).toBeTruthy();
    expect(original.querySelector('img')).toBeNull();
  });

  it('keeps a historical view from launching another audit while the latest capture is active', async () => {
    window.history.replaceState(null, '', '/visibility?project=p1&auditId=4');
    vi.mocked(useVisibilityDashboard).mockReturnValue(dashboard(true, true));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const query = new URL(url, 'http://localhost').searchParams;
      if (query.get('view') === 'prompts') return Response.json([{ id: 1, text: '有哪些方案' }]);
      if (query.get('view') === 'captureV4') {
        return query.get('auditId') === '12'
          ? Response.json(capture('waiting_for_capture'))
          : Response.json({ ...capture('completed'), audit_id: '4' });
      }
      return Response.json({ items: [], next_cursor: null });
    }));
    render(<VisibilityPage />);
    const launch = await screen.findByRole<HTMLButtonElement>('button', { name: '当前采集进行中' });
    expect(launch.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '发起新审计' })).toBeNull();
  });

  it.each(['historical', 'legacy-latest'])('starts a new audit after collection ends (%s)', async mode => {
    const historical = mode === 'historical';
    if (historical) window.history.replaceState(null, '', '/visibility?project=p1&auditId=4');
    vi.mocked(useVisibilityDashboard).mockReturnValue(dashboard(true, true));
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Response.json({ audit_id: '13' });
      const query = new URL(url, 'http://localhost').searchParams;
      if (query.get('view') === 'prompts') return Response.json([{ id: 1, text: '有哪些方案' }]);
      if (query.get('view') === 'captureV4') {
        const id = query.get('auditId');
        if (id === '13') return Response.json({ ...capture('waiting_for_capture'), audit_id: '13' });
        if (id === '12' && historical) return Response.json(capture('running'));
        return Response.json({ error: 'Sampling audit not found' }, { status: 404 });
      }
      return Response.json({ items: [], next_cursor: null });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<VisibilityPage />);
    fireEvent.click(await screen.findByRole('button', { name: '发起新审计' }));
    fireEvent.click(screen.getByRole('button', { name: '确认开始采集' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/visibility?project=p1&auditId=13', { scroll: false }));
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  });

  it('offers decision to retry analysis only after failure, without starting a collection', async () => {
    vi.mocked(useVisibilityDashboard).mockReturnValue(dashboard(true, true));
    let retried = false;
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        retried = true;
        return Response.json({ status: 'queued' });
      }
      return Response.json(capture(retried ? 'queued' : 'failed'));
    });
    vi.stubGlobal('fetch', fetcher);
    render(<AuditInsightV4 projectId="p1" />);
    const retry = await screen.findByRole('button', { name: '用本次数据重新分析' });
    expect(screen.queryByRole('button', { name: '开始本次采集' })).toBeNull();
    expect(fetcher.mock.calls.filter(([, init]) => init?.method).length).toBe(0);
    fireEvent.click(retry);
    await screen.findByText('等待分析');
    expect(screen.queryByRole('button', { name: '用本次数据重新分析' })).toBeNull();
    const posts = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body)))
      .toMatchObject({ action: 'retryAnalysis', auditId: '12', failedAttemptId: attemptId });
  });

  it('keeps the audit score stable while comparing a discovered brand and opening evidence', async () => {
    vi.mocked(useVisibilityDashboard).mockReturnValue(dashboard(true, true));
    const report: AuditScoreReport = {
      audit_id: '12', run_id: runId, status: 'published', own_target_id: 'registry:own',
      targets: [
        { target_id: 'registry:own', name: '云衡', role: 'own', identity_method: 'confirmed', identity_status: 'confirmed' },
        { target_id: 'registry:rival', name: '锐川', role: 'competitor', identity_method: 'confirmed', identity_status: 'confirmed' },
        { target_id: 'entity:new', name: '拓域', role: 'unregistered', identity_method: 'observed_name', identity_status: 'provisional' },
      ],
      score: { value: 58, no_score_reason: null, coverage: {
        capture_planned: 3, scored: 1, planned: 2, scored_platforms: 1, planned_platforms: 2,
        scored_sample_ids: [sampleId], missing_reasons: { directed_question: 1 }, platforms: [],
      } },
      comparison: { target_id: 'registry:rival', common_sample_count: 1, own_only_count: 0, comparison_only_count: 0, scope_planned: 2, own: { value: 58, no_score_reason: null }, other: { value: 74, no_score_reason: null } },
      recommendations: [
        { id: 'next-1', title: '补充选型依据', dimension: 'reasons', platform: 'qwen', scenario: 'selection',
          gap: 16, prompt_id: '1', prompt: '仓储工具如何选', sample_id: sampleId, response_id: runId,
          observed_reason: '真实建议证据', deliverable: '复核并补充案例', success_check: '同题验证',
          observed_gap_samples: 1, common_samples_in_scope: 1, evidence: [],
          source_support: [{ ordinal: 1, snapshot_id: snapshotId, source_quote: '正文证据' }], action_opportunity: { id: opportunity, scenario: 'unreviewed' } },
      ],
    };
    const fetcher = vi.fn(async (url: string) => {
      const query = new URL(url, 'http://localhost').searchParams;
      if (query.get('view') === 'captureV4') return Response.json(capture('completed'));
      if (query.get('compareTarget') === 'entity:new') return Response.json({
        ...report, comparison: { ...report.comparison, target_id: 'entity:new' }, recommendations: [],
      });
      return Response.json(report);
    });
    vi.stubGlobal('fetch', fetcher);
    render(<AuditInsightV4 projectId="p1" />);
    const source = await screen.findByRole('link', { name: '核对引用正文' });
    expect(source.getAttribute('href')).toBe('/visibility?project=p1&auditId=12&sampleId=' + sampleId + '&ordinal=1&snapshotId=' + snapshotId);
    const action = new URL(screen.getByRole('link', { name: '查看优化行动' }).getAttribute('href')!, 'http://localhost');
    expect(action.searchParams.get('opportunity')).toBe(opportunity);
    expect(action.searchParams.get('scenario')).toBe('unreviewed');
    expect(document.querySelector('.v4-score')?.textContent).toContain('58');
    fireEvent.change(screen.getByLabelText('对比品牌'), { target: { value: 'entity:new' } });
    expect(await screen.findByText(/本次对比使用回答中明确出现的名称/)).toBeTruthy();
    expect(document.querySelector('.v4-score')?.textContent).toContain('58');
    expect(screen.getByRole('heading', { name: '优化建议' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '刷新状态' })).toBeNull();
  });
});
