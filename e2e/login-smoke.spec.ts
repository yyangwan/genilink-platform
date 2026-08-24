import { expect, test } from '@playwright/test';

test('login page renders the core auth controls', async ({ page }) => {
  await page.goto('/auth/login');

  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.getByLabel(/手机号|phone/i)).toBeVisible();
  await expect(page.getByLabel(/验证码|code/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /获取验证码/i })).toBeVisible();
  await expect(page.locator('form').getByRole('button', { name: /登录|login/i })).toBeVisible();
});
