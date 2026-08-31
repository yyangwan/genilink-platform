// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-auth/react', () => ({ signIn: mocks.signIn }));

import LoginPage from '@/app/(auth)/auth/login/page';

describe('login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockResolvedValue({ error: null });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ workspaces: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps phone registration as the default and offers email login for bound accounts', async () => {
    render(<LoginPage />);
    expect(screen.getByText('未注册手机号验证后将自动创建账号')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '邮箱登录' }));
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password123' } });
    fireEvent.submit(screen.getByLabelText('密码').closest('form')!);

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith('email-password', {
      email: 'user@example.com',
      password: 'password123',
      redirect: false,
    }));
    expect(screen.getByText('邮箱登录需先通过手机号注册，并在账号设置中启用')).toBeTruthy();
  });
});
