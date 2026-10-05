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
  channel: 'chrome',
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
  const previousAnswers = await page.locator('.qk-markdown-react').count();
  const previousAnswer = previousAnswers > 0 ? await page.locator('.qk-markdown-react').last().innerText() : '';
  await input.fill(prompt);
  await page.getByRole('button', { name: '发送消息' }).click();
  await page.waitForFunction(({ previousCount, previousText }) => {
    const markdowns = [...document.querySelectorAll('.qk-markdown-react')];
    const markdown = markdowns.at(-1);
    const stop = [...document.querySelectorAll('button')].some(button => /停止回答/.test(button.getAttribute('aria-label') || button.innerText));
    const answer = markdown?.innerText.trim() || '';
    return answer.length > 0 && (markdowns.length > previousCount || answer !== previousText) && !stop;
  }, { previousCount: previousAnswers, previousText: previousAnswer }, { timeout: timeoutMs });
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
  for (let expanded = 0; expanded < 20; expanded += 1) {
    const buttons = await page.getByText('查看全部', { exact: true }).all();
    let clicked = false;
    for (const button of buttons) {
      if (!await button.isVisible()) continue;
      await button.evaluate(element => element.click());
      clicked = true;
      break;
    }
    if (!clicked) break;
    await page.waitForTimeout(100);
  }
  const snapshot = await page.evaluate(() => {
    const markdown = [...document.querySelectorAll('.qk-markdown-react')].at(-1);
    let region = markdown?.parentElement;
    while (region && region !== document.body && !/已完成分析.*参考|已完成思考.*参考/s.test(region.innerText.slice(0, 300))) {
      region = region.parentElement;
    }
    const referenceTexts = [...(region || document).querySelectorAll('span')].map(span => span.textContent || '');
    const referenceCount = Math.max(0, ...referenceTexts.map(text => Number(text.match(/共参考\s*(\d+)\s*篇资料/)?.[1] || text.match(/参考\s*(\d+)\s*篇资料/)?.[1] || 0)));
    const links = [...(region || document).querySelectorAll('a[href]')].map(anchor => ({
      url: anchor.href,
      title: anchor.innerText,
      siteName: anchor.hostname,
    }));
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
