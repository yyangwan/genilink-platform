import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { extractQwenResult } from './qwen-extract.mjs';

const [taskPath, resultPath, profilePath] = process.argv.slice(2);
const task = JSON.parse(await fs.readFile(taskPath, 'utf8'));
if (task.task_type !== 'browser.prompt' || task.platform !== 'qwen' || task.surface !== 'web') {
  throw new Error('Unsupported browser task');
}
const prompt = String(task.payload?.prompt || '').trim();
if (!prompt) throw new Error('Qwen browser task has no prompt');
const timeoutMs = Math.min(Math.max(Number(task.payload?.timeout_seconds || 420) * 1000, 30_000), 600_000);
const started = Date.now();
const context = await chromium.launchPersistentContext(profilePath, {
  channel: 'msedge',
  headless: true,
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
});
try {
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.goto('https://www.qianwen.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const input = page.locator('[role="textbox"][contenteditable="true"]').first();
  await input.waitFor({ timeout: 30_000 });
  await input.fill(prompt);
  await page.getByRole('button', { name: '发送消息' }).click();
  await page.waitForFunction(() => {
    const text = document.body.innerText;
    return /已完成分析/.test(text) || /已完成思考/.test(text);
  }, null, { timeout: timeoutMs });
  await page.waitForFunction(() => {
    const markdown = [...document.querySelectorAll('.qk-markdown-react')].at(-1);
    const stop = [...document.querySelectorAll('button')].some(button => /停止回答/.test(button.getAttribute('aria-label') || button.innerText));
    return markdown && markdown.innerText.trim().length > 0 && !stop;
  }, null, { timeout: timeoutMs });
  let stableAnswer = '';
  let stableSamples = 0;
  while (stableSamples < 3) {
    if (Date.now() - started > timeoutMs) throw new Error('Qwen answer did not stabilize before timeout');
    await page.waitForTimeout(1500);
    const current = await page.locator('.qk-markdown-react').last().innerText();
    stableSamples = current === stableAnswer ? stableSamples + 1 : 0;
    stableAnswer = current;
  }
  const sourcesStarted = Date.now();
  await page.getByText('查看全部', { exact: true }).all().then(async buttons => {
    for (const button of buttons) await button.click();
  });
  const snapshot = await page.evaluate(() => {
    const markdown = [...document.querySelectorAll('.qk-markdown-react')].at(-1);
    const referenceTexts = [...document.querySelectorAll('span')].map(span => span.textContent || '');
    const referenceCount = Math.max(0, ...referenceTexts.map(text => Number(text.match(/共参考\s*(\d+)\s*篇资料/)?.[1] || text.match(/参考\s*(\d+)\s*篇资料/)?.[1] || 0)));
    const links = [];
    for (const label of [...document.querySelectorAll('span')].filter(span => /^(查看全部|收起)$/.test(span.textContent?.trim() || ''))) {
      const group = label.parentElement;
      if (!group) continue;
      for (const anchor of group.querySelectorAll('a[href]')) {
        links.push({ url: anchor.href, title: anchor.innerText, siteName: anchor.hostname });
      }
    }
    return { answer: markdown?.innerText || '', referenceCount, links };
  });
  snapshot.sourceCollectionDurationMs = Date.now() - sourcesStarted;
  const result = extractQwenResult(snapshot);
  result.duration_ms = Date.now() - started;
  if (!result.answer) throw new Error('Qwen answer was not visible');
  if (result.reference_count > 0 && result.sources.length < result.reference_count) {
    throw new Error(`Qwen references incomplete: ${result.sources.length}/${result.reference_count}`);
  }
  await fs.writeFile(resultPath, JSON.stringify(result), 'utf8');
} finally {
  await context.close();
}
