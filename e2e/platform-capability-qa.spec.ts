import { test } from '@playwright/test';
import fs from 'node:fs';

const outDir = 'qa-artifacts/2026-06-04';

type QaEvent =
  | { type: 'console'; level: string; text: string }
  | { type: 'pageerror'; text: string }
  | { type: 'response'; status: number; url: string };

async function bodyInfo(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const text = document.body?.innerText || '';
    const headings = Array.from(document.querySelectorAll('h1,h2'))
      .slice(0, 5)
      .map((element) => element.textContent?.trim());
    const buttons = Array.from(document.querySelectorAll('button'))
      .slice(0, 15)
      .map((element) => element.textContent?.trim());
    const inputs = Array.from(document.querySelectorAll('input,textarea,select')).map(
      (element) => ({
        id: element.id,
        name: element.getAttribute('name'),
        placeholder: element.getAttribute('placeholder'),
        type: element.getAttribute('type'),
      }),
    );
    const mojibake = text.includes(String.fromCharCode(65533)) || /(?:Ã|Â)/.test(text);
    return {
      url: location.href,
      title: document.title,
      headings,
      buttons,
      inputs,
      text: text.slice(0, 1200),
      mojibake,
    };
  });
}

test('report-only full platform capability QA', async ({ page }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(5000);

  fs.mkdirSync(outDir, { recursive: true });

  const events: QaEvent[] = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      events.push({ type: 'console', level: message.type(), text: message.text().slice(0, 500) });
    }
  });
  page.on('pageerror', (error) => {
    events.push({ type: 'pageerror', text: error.message.slice(0, 500) });
  });
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && url.includes('127.0.0.1:3001')) {
      events.push({ type: 'response', status, url });
    }
  });

  const results: unknown[] = [];
  const screenshot = async (label: string) => {
    const path = `${outDir}/${label.replace(/[^a-z0-9_-]/gi, '_')}.png`;
    await page.screenshot({ path, fullPage: true });
    return path;
  };
  const record = async (route: string, label: string) => {
    const before = events.length;
    let ok = true;
    let error = '';
    try {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(1800);
    } catch (err) {
      ok = false;
      error = (err as Error).message;
    }
    const info = await bodyInfo(page).catch((err) => ({
      url: page.url(),
      text: '',
      headings: [],
      buttons: [],
      inputs: [],
      mojibake: false,
      evalError: (err as Error).message,
    }));
    results.push({
      route,
      label,
      ok,
      error,
      info,
      events: events.slice(before),
      screenshot: await screenshot(label),
    });
  };

  await record('/auth/register', '00_register_initial');

  const email = `qa-${Date.now()}@example.com`;
  const authFlow: Record<string, unknown> = { email, steps: [] };
  try {
    await page.fill('#name', 'QA Tester');
    await page.fill('#email', email);
    await page.fill('#password', 'Password123!');
    await page.fill('#confirmPassword', 'Password123!');
    await page.locator('form button[type="submit"]').click();
    await page.waitForTimeout(3500);
    (authFlow.steps as unknown[]).push({ afterRegister: await bodyInfo(page) });

    if (page.url().includes('/onboarding')) {
      await page.fill('#workspaceName', 'QA Workspace');
      await page.locator('main button').last().click();
      await page.waitForTimeout(700);
      if ((await page.locator('main .grid button').count()) > 0) {
        await page.locator('main .grid button').first().click();
      }
      await page.locator('main button').last().click();
      await page.waitForTimeout(700);
      await page.fill('#projectName', 'QA Project');
      await page.fill('#projectUrl', 'https://example.com');
      await page.locator('main button').last().click();
      await page.waitForTimeout(700);
      const textInputs = page.locator('input[type="text"]');
      if ((await textInputs.count()) > 0) await textInputs.nth(0).fill('QA Product');
      if ((await textInputs.count()) > 1) {
        await textInputs.nth(1).fill('GEO');
        await page.keyboard.press('Enter');
      }
      const textarea = page.locator('textarea');
      if (await textarea.count()) await textarea.fill('A QA product description for platform testing.');
      await page.locator('main button').last().click();
      await page.waitForTimeout(4500);
    }

    (authFlow.steps as unknown[]).push({ afterOnboarding: await bodyInfo(page) });
    await screenshot('01_after_auth_onboarding');
  } catch (err) {
    authFlow.error = (err as Error).message;
    authFlow.current = await bodyInfo(page).catch(() => null);
    await screenshot('01_auth_flow_error');
  }

  const routes = [
    ['/dashboard', 'dashboard'],
    ['/projects', 'projects'],
    ['/brands', 'brands'],
    ['/visibility', 'zhijian_visibility'],
    ['/audits', 'zhijian_audits'],
    ['/schedules', 'zhijian_schedules'],
    ['/suggestions', 'zhijian_suggestions'],
    ['/trends', 'zhijian_trends'],
    ['/compare', 'zhijian_compare'],
    ['/insights', 'zhijian_insights'],
    ['/strategic', 'zhijian_strategic'],
    ['/content', 'zhichuang_content_overview'],
    ['/content/list', 'zhichuang_content_list'],
    ['/content/new', 'zhichuang_content_new'],
    ['/content/calendar', 'zhichuang_calendar'],
    ['/content/insights', 'zhichuang_insights'],
    ['/content/genie', 'zhichuang_genie'],
    ['/content/brand-voices', 'zhichuang_brand_voices'],
    ['/content/templates', 'zhichuang_templates'],
    ['/content/settings', 'zhichuang_settings'],
    ['/settings', 'settings'],
    ['/settings/account', 'settings_account'],
    ['/settings/workspace', 'settings_workspace'],
    ['/settings/prompts', 'settings_prompts'],
    ['/settings/billing', 'settings_billing'],
  ] as const;

  for (const [route, label] of routes) {
    await record(route, label);
  }

  fs.writeFileSync(
    `${outDir}/playwright-results.json`,
    JSON.stringify({ createdAt: new Date().toISOString(), authFlow, results, allEvents: events }, null, 2),
    'utf8',
  );
});
