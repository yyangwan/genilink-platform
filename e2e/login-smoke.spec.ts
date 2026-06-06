import { expect, test } from '@playwright/test';

test('login page renders the core auth controls', async ({ page }) => {
  await page.goto('/auth/login');

  await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  await expect(page.getByLabel(/邮箱|email/i)).toBeVisible();
  await expect(page.getByLabel(/密码|password/i)).toBeVisible();
  await expect(page.locator('form').getByRole('button', { name: /登录|login/i })).toBeVisible();
});
