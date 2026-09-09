// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const push = vi.fn();
const addToast = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/dashboard/use-section-fetch', () => ({
  useSectionFetch: (url: string) => url.includes('/api/integration/suggestions')
    ? {
        data: [{ id: '68', text: '建立百度百科词条获得DeepSeek引用', priority: 'high' }],
        loading: false,
        error: false,
        locked: false,
      }
    : {
        data: { totalContent: 0, publishedCount: 0, qualityAvg: null, recentContent: [] },
        loading: false,
        error: false,
        locked: false,
      },
}));
vi.mock('@/components/project/project-context', () => ({
  useProject: () => ({
    currentProjectId: 'project-1',
    currentProject: { name: '智链', productName: 'GEO' },
    loading: false,
    openWizard: vi.fn(),
    projects: [{ id: 'project-1' }],
  }),
}));
vi.mock('@/components/ui/page-header', () => ({ PageHeader: ({ title }: { title: string }) => <div>{title}</div> }));
vi.mock('@/components/ui/diagnostic-checklist', () => ({ DiagnosticChecklist: () => null }));
vi.mock('@/components/billing/subscription-required-state', () => ({ SubscriptionRequiredState: () => null }));
vi.mock('@/components/ui/toast-context', () => ({ useToast: () => ({ addToast }) }));

import ContentPage from '@/app/(dashboard)/content/page';

describe('/content 智见建议 → 创作方案', () => {
  beforeEach(() => {
    push.mockClear();
    addToast.mockClear();
  });

  it('sends only suggestionId and navigates by briefId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { id: 'brief_abc', refinement: { status: 'queued' } },
          meta: { replayed: false },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentPage />);
    fireEvent.click(screen.getByRole('button', { name: /AI 生成/ }));

    await waitFor(() => expect(push).toHaveBeenCalledOnce());
    expect(push.mock.calls[0][0]).toBe('/content/new?briefId=brief_abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/content/briefs/from-suggestion?projectId=project-1');
    expect(init.method).toBe('POST');
    expect(init.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(init.body)).toEqual({ projectId: 'project-1', suggestionId: '68' });
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '已生成基础创作方案',
    }));
    vi.unstubAllGlobals();
  });

  it('shows an ineligible toast and stays on the page on 422', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'SUGGESTION_NOT_CONTENT_ELIGIBLE', message: '该建议属于技术/运营任务' } }),
        { status: 422, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentPage />);
    fireEvent.click(screen.getByRole('button', { name: /AI 生成/ }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
        type: 'error',
        title: '创建创作方案失败',
      })),
    );
    expect(push).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('keeps the idempotency key and shows 正在确认 on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network down'));
    vi.stubGlobal('fetch', fetchMock);

    render(<ContentPage />);
    fireEvent.click(screen.getByRole('button', { name: /AI 生成/ }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: '正在确认' })),
    );
    expect(push).not.toHaveBeenCalled();

    // 网络恢复后重试：复用同一幂等键，不生成第二个键。
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    fireEvent.click(screen.getByRole('button', { name: /AI 生成/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const key1 = fetchMock.mock.calls[0][1].headers['Idempotency-Key'];
    const key2 = fetchMock.mock.calls[1][1].headers['Idempotency-Key'];
    expect(key2).toBe(key1);
    vi.unstubAllGlobals();
  });
});
