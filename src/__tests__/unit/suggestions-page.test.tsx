// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/components/dashboard/use-section-fetch', () => ({
  useSectionFetch: vi.fn(),
}));

vi.mock('@/components/project/project-context', () => ({
  useProject: vi.fn(),
}));

vi.mock('@/components/ui/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/components/ui/diagnostic-checklist', () => ({
  DiagnosticChecklist: () => <div>diagnostic-checklist</div>,
}));

vi.mock('@/components/ui/error-state', () => ({
  ErrorState: () => <div>error-state</div>,
}));

vi.mock('@/components/ui/empty-state', () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}));

import { useSectionFetch } from '@/components/dashboard/use-section-fetch';
import { useProject } from '@/components/project/project-context';
import SuggestionsPage from '@/app/(dashboard)/suggestions/page';

describe('/suggestions page locked state', () => {
  it('shows an upgrade message instead of an empty page when suggestions are locked', () => {
    vi.mocked(useProject).mockReturnValue({
      currentProjectId: 'project-1',
      currentProject: { productName: 'Test Product' },
      loading: false,
      openWizard: vi.fn(),
      projects: [{ id: 'project-1' }],
    } as never);

    vi.mocked(useSectionFetch).mockReturnValue({
      data: null,
      loading: false,
      error: false,
      locked: true,
      refetch: vi.fn(),
    });

    render(<SuggestionsPage />);

    expect(screen.getByText('需要升级后使用')).toBeTruthy();
    expect(screen.getByText('优化建议功能需要订阅智见专业版')).toBeTruthy();
    expect(screen.queryByText('点击查看行动计划')).toBeNull();
  });

  it('shows source-level evidence and action references in expanded suggestion cards', () => {
    vi.mocked(useProject).mockReturnValue({
      currentProjectId: 'project-1',
      currentProject: { productName: 'Test Product' },
      loading: false,
      openWizard: vi.fn(),
      projects: [{ id: 'project-1' }],
    } as never);

    vi.mocked(useSectionFetch).mockReturnValue({
      data: [
        {
          id: '154',
          text: 'Improve DeepSeek citation coverage',
          category: 'content_optimization',
          platform: 'DeepSeek',
          priority: 'high',
          status: 'pending',
          evidence_sources: ['zhihu.com/question/123', 'brand.com/blog/deepseek'],
          evidence_channels: ['知乎', '官网博客'],
          action_sources: ['brand.com/blog/deepseek', 'zhihu.com/question/123'],
          action_channels: ['content'],
          action_type: '发布FAQ和对比页',
          evidence_summary: 'DeepSeek did not cite owned pages for recommendation prompts.',
          audit_findings: ['Owned brand appeared after two competitors'],
          success_metric: 'Owned page cited in at least 3 of 5 DeepSeek prompts',
        },
      ],
      loading: false,
      error: false,
      locked: false,
      refetch: vi.fn(),
    });

    render(<SuggestionsPage />);

    fireEvent.click(screen.getByText('Improve DeepSeek citation coverage'));

    expect(screen.getByText('证据引用来源网站')).toBeTruthy();
    expect(screen.getByText('行动落点网站')).toBeTruthy();
    expect(screen.getAllByText('zhihu.com/question/123')).toHaveLength(2);
    expect(screen.getAllByText('brand.com/blog/deepseek')).toHaveLength(2);
  });
});
