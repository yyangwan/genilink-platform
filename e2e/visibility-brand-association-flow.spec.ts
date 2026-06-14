import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const debugLog = 'qa-artifacts/visibility-brand-association-flow.log';

function log(step: string) {
  fs.mkdirSync('qa-artifacts', { recursive: true });
  fs.appendFileSync(debugLog, `${new Date().toISOString()} ${step}\n`, 'utf8');
}

test('brand association flow starts analysis from frontend pages', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync('qa-artifacts', { recursive: true });
  fs.writeFileSync(debugLog, '', 'utf8');
  log('start');

  const suffix = Date.now().toString(36);
  const email = `qa-brand-${suffix}@example.com`;
  const workspaceName = `QA Workspace ${suffix}`;
  const projectName = `QA Project ${suffix}`;
  const brandName = `QA Brand ${suffix}`;

  await page.goto('/auth/register');
  log('register page');
  await page.locator('#name').fill('QA Tester');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('Password123!');
  await page.locator('#confirmPassword').fill('Password123!');
  await page.getByRole('button', { name: '注册' }).click();

  await page.waitForURL(/\/onboarding$/, { timeout: 30_000 });
  log('onboarding');

  await page.locator('#workspaceName').fill(workspaceName);
  await page.getByRole('button', { name: '下一步' }).click();

  await page.locator('button').filter({ hasText: /科技|电商|金融|保险|教育|医疗|其他/ }).first().click();
  await page.getByRole('button', { name: '下一步' }).click();
  log('onboarding step 2');
  await page.locator('#projectName').fill(projectName);
  await page.locator('#projectUrl').fill('https://example.com');
  await page.getByRole('button', { name: '下一步' }).click();

  await page.getByRole('button', { name: /完成设置|设置完成/ }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 30_000 });
  log('dashboard');

  await page.goto('/projects');
  log('projects');
  const projectLink = page.locator('a[href^="/projects/"]').filter({ hasText: projectName }).first();
  await expect(projectLink).toBeVisible();
  const projectHref = await projectLink.getAttribute('href');
  expect(projectHref).toBeTruthy();
  const projectId = projectHref!.split('/').filter(Boolean).pop();
  expect(projectId).toBeTruthy();

  await page.goto('/brands');
  log('brands');
  await page.getByRole('button', { name: '添加品牌' }).click();
  await page.getByPlaceholder('品牌名称').fill(brandName);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText(brandName, { exact: true })).toBeVisible();

  await page.goto(`/projects/${projectId}`);
  log('project detail');
  await expect(page.getByRole('heading', { name: projectName })).toBeVisible();

  await page.getByRole('button', { name: '关联品牌' }).first().click();
  await page.getByRole('button', { name: brandName }).click();
  await expect(page.getByText(brandName, { exact: true })).toBeVisible();

  await page.route('**/api/integration/audits', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/integration/audits/*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'audit-1', status: 'running', phase: 'running' }),
      });
      return;
    }
    await route.continue();
  });
  await page.route('**/api/integration/audit-status?*', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: [
          'event: platform_start',
          'data: {"platform":"deepseek"}',
          '',
        ].join('\n'),
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole('button', { name: '查看分析' }).first().click();
  await page.waitForURL(/\/visibility$/, { timeout: 30_000 });
  log('visibility');
  const startAnalysisButton = page.getByRole('button', { name: '开始 AI 分析' }).first();
  await expect(startAnalysisButton).toBeVisible();
  log('start button visible');

  const brandsResponsePromise = page.waitForResponse((response) =>
    response.url().includes(`/api/projects/${projectId}/brands`) &&
    response.request().method() === 'GET',
  );
  const auditRequestPromise = page.waitForRequest((request) =>
    new URL(request.url()).pathname === '/api/integration/audits' &&
    request.method() === 'POST',
  );
  const auditResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/integration/audits' &&
    response.request().method() === 'POST',
  );

  await startAnalysisButton.click();
  log('clicked start');

  const brandsResponse = await brandsResponsePromise;
  log('brands response');
  const brandsPayload = await brandsResponse.json();
  expect(brandsResponse.ok()).toBeTruthy();
  expect(Array.isArray(brandsPayload.brands)).toBe(true);
  expect(brandsPayload.brands).toHaveLength(1);

  await auditRequestPromise;
  const auditResponse = await auditResponsePromise;
  expect(auditResponse.ok()).toBeTruthy();

  await expect(page.getByText('AI 分析中').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('正在分析平台返回结果...')).toBeVisible({ timeout: 15_000 });
});
