// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const addToast = vi.fn();

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: '张明', email: 'zhang@example.com' } } }),
}));

vi.mock('@/components/project/project-context', () => ({
  useProject: () => ({
    currentProjectId: 'project-a',
    currentProject: { id: 'project-a', name: '品牌增长项目' },
    loading: false,
  }),
}));

vi.mock('@/components/ui/toast-context', () => ({ useToast: () => ({ addToast }) }));

import { SettingsInner } from '@/app/(dashboard)/content/settings/page';
import { PUBLISHING_PLATFORMS } from '@/lib/content/publishing-platforms';

describe('publishing platform settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { connected: false } }),
    }));
  });

  it('shows the account and project scope and opens a platform-specific configuration entry', async () => {
    render(<SettingsInner />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    expect(screen.getByText('张明')).toBeTruthy();
    expect(screen.getByText('品牌增长项目')).toBeTruthy();
    expect(screen.getByAltText('微信公众号官方图标').getAttribute('src')).toContain('/platform-icons/wechat.svg');

    const wechatCard = (await screen.findByRole('heading', { name: '微信公众号' })).closest('article');
    expect(wechatCard).not.toBeNull();
    fireEvent.click(within(wechatCard as HTMLElement).getByRole('button', { name: /配置/ }));

    expect(screen.getByRole('dialog', { name: '微信公众号配置' })).toBeTruthy();
    expect(screen.getByText(/账号“张明”在项目“品牌增长项目”中使用/)).toBeTruthy();
    expect(screen.getByLabelText('App ID')).toBeTruthy();
    expect(screen.getByLabelText('App Secret').getAttribute('type')).toBe('password');
    expect(screen.getByText('如何获取所需信息')).toBeTruthy();
    expect(screen.getByText(/设置与开发 → 基本配置/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /打开微信公众平台/ }).getAttribute('href')).toBe('https://mp.weixin.qq.com/');
  });

  it('provides actionable official guidance for every supported platform', () => {
    expect(PUBLISHING_PLATFORMS).toHaveLength(6);
    for (const platform of PUBLISHING_PLATFORMS) {
      expect(platform.iconSrc).toMatch(/^\/platform-icons\/.+\.(png|svg)$/);
      expect(platform.credentialGuide.steps.length).toBeGreaterThanOrEqual(3);
      expect(platform.credentialGuide.consoleUrl.startsWith('https://')).toBe(true);
      expect(platform.credentialGuide.consoleLabel.length).toBeGreaterThan(4);
    }
  });
});
