// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'user-1', name: '测试用户', email: null } },
    update: mocks.update,
  }),
}));

import AccountSettingsPage from '@/app/(dashboard)/settings/account/page';

describe('account email password settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: null, configured: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: 'user@example.com',
        configured: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lets a signed-in phone user bind an email and password', async () => {
    render(<AccountSettingsPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: '启用邮箱密码登录' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('登录邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('手机号验证码'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('登录密码'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('确认密码'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: '启用邮箱密码登录' }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenLastCalledWith('/api/user/login-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'password123', verificationCode: '123456' }),
    }));
    expect(await screen.findByText('邮箱密码登录已启用')).toBeTruthy();
  });
});
