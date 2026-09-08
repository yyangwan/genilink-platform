// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

describe('/content AI generation', () => {
  it('continues to content creation with transparent fallback guidance when deep analysis times out', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        generatedBy: 'rules',
        fallbackReason: 'The operation was aborted due to timeout',
        topic: '建立百度百科词条获得DeepSeek引用',
        keyPoints: ['说明平台定位与核心能力'],
        references: '',
        notes: '围绕当前项目展开',
        platforms: ['zhihu'],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    render(<ContentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'AI 生成' }));

    await waitFor(() => expect(push).toHaveBeenCalledOnce());
    expect(push.mock.calls[0][0]).toContain('/content/new?');
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'info',
      title: '已生成基础创作信息',
    }));
  });
});
