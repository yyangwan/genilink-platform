import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { extractQwenResult } from './qwen-extract.mjs';
import { readQwenPageState, advanceQwenAnswer } from './qwen-state.mjs';

const [taskPath, resultPath, profilePath] = process.argv.slice(2);
const task = JSON.parse(await fs.readFile(taskPath, 'utf8'));
if (task.task_type !== 'browser.prompt' || task.platform !== 'qwen' || task.surface !== 'web') {
  throw new Error('Unsupported browser task');
}
const prompt = String(task.payload?.prompt || '').trim();
if (!prompt) throw new Error('Qwen browser task has no prompt');
const timeoutMs = Math.min(Math.max(Number(task.payload?.timeout_seconds || 420) * 1000, 30_000), 600_000);
const started = Date.now();
let context;
let page;
let stage = 'browser_start';
try {
  context = await chromium.launchPersistentContext(profilePath, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'zh-CN',
  });
  page = context.pages()[0] || await context.newPage();
  stage = 'page_load';
  page.setDefaultTimeout(15_000);
  await page.goto('https://www.qianwen.com/', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  const input = page.locator('[role="textbox"][contenteditable="true"]').first();
  await input.waitFor({ timeout: 30_000 });
  const previousAnswers = await page.locator('.qk-markdown-react').count();
  const previousAnswer = previousAnswers > 0 ? await page.locator('.qk-markdown-react').last().innerText() : '';
  await input.fill(prompt);
  await page.getByRole('button', { name: '发送消息' }).click();
  stage = 'answer_wait';
  const answerDeadline = Date.now() + timeoutMs;
  let progress = {answer: '', stableSamples: 0, complete: false};
  while (!progress.complete) {
    const state = await page.evaluate(readQwenPageState);
    progress = advanceQwenAnswer(progress, state, {count: previousAnswers, answer: previousAnswer});
    if (Date.now() >= answerDeadline) throw new Error(`QWEN_ANSWER_TIMEOUT: answer_chars=${state.answer.length} generating=${state.generating}`);
    if (!progress.complete) await page.waitForTimeout(1500);
  }
  stage = 'source_collection';
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
    while (region && region !== document.body && !/已完成分析.*参考|已完成思考.*参考|\d+\s*篇来源/s.test(region.innerText)) {
      region = region.parentElement;
    }
    const referenceTexts = [...(region || document).querySelectorAll('span')].map(span => span.textContent || '');
    const referenceCount = Math.max(0, ...referenceTexts.map(text => Number(text.match(/共参考\s*(\d+)\s*篇资料/)?.[1] || text.match(/参考\s*(\d+)\s*篇资料/)?.[1] || text.match(/(\d+)\s*篇来源/)?.[1] || 0)));
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
} catch (error) {
  let state;
  try { state = page && await page.evaluate(readQwenPageState); } catch {}
  const diagnostic = {stage, message: String(error.message), url: state?.url, title: state?.title,
    answerCount: state?.answerCount, answerChars: state?.answer?.length,
    generating: state?.generating, loginRequired: state?.loginRequired};
  await fs.writeFile(`${resultPath}-error.json`, JSON.stringify(diagnostic), 'utf8');
  if (page && !state?.loginRequired) {
    try { await page.screenshot({path: `${resultPath}-error.png`, fullPage: true}); } catch {}
  }
  console.error(`${error.message} (stage=${stage}; diagnostic=${resultPath}-error.json)`);
  process.exitCode = 1;
} finally {
  try { await context?.close(); } catch (error) {
    console.error(`QWEN_BROWSER_CLEANUP_FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
